#!/usr/bin/env python3
"""POSIX capability file broker. No shell, eval, networking, plugins or URL imports.

The trusted controller supplies a fresh private workspace and selected input folder.
Worker arguments never select a host root. All untrusted paths resolve through held
directory descriptors with O_NOFOLLOW. Windows fails closed pending a native broker.
"""
import hashlib
import json
import os
import re
import stat
import sys
import time
import uuid

MAX_FILE = 16000
MAX_FILES = 128
MAX_TOTAL = 1024 * 1024
SEGMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\Z")


class Denied(Exception):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def parts(path):
    if not isinstance(path, str) or len(path) > 512:
        raise Denied("invalid_path")
    result = path.split("/")
    if len(result) > 9 or any(not SEGMENT.fullmatch(x) or ".." in x for x in result):
        raise Denied("invalid_path")
    if result[0] not in ("input", "work", "output"):
        raise Denied("invalid_path")
    return result


def directory(parent, name):
    return os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)


def ordinary(fd):
    s = os.fstat(fd)
    if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or s.st_size > MAX_FILE:
        raise Denied("not_an_allowed_file")
    return s


def read_at(parent, name):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        ordinary(fd)
        data = b""
        while len(data) <= MAX_FILE:
            block = os.read(fd, MAX_FILE + 1 - len(data))
            if not block:
                break
            data += block
        ordinary(fd)
        if len(data) > MAX_FILE:
            raise Denied("file_quota")
        data.decode("utf-8", errors="strict")
        return data
    finally:
        os.close(fd)


class Workspace:
    def __init__(self, root, source):
        if os.name != "posix" or os.open not in os.supports_dir_fd:
            raise Denied("platform_not_supported")
        os.umask(0o077)
        # Root and source are trusted local-owner parameters, never model arguments.
        os.mkdir(root, 0o700)  # Refuse existing workspaces, including symlinks/restarts.
        self.root = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.handles = {}
        self.sealed = False
        self.receipts = {}
        self.write_bytes = 0
        self.operations = 0
        self.read_bytes = 0
        for name in ("input", "work", "output"):
            os.mkdir(name, 0o700, dir_fd=self.root)
            self.handles[name] = directory(self.root, name)
        src = os.open(source, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            self.copy_tree(src, self.handles["input"], [0, 0], 0)
        finally:
            os.close(src)

    def close(self):
        for fd in self.handles.values():
            os.close(fd)
        os.close(self.root)

    def copy_tree(self, src, dst, totals, depth):
        if depth > 7:
            raise Denied("input_depth")
        for name in sorted(os.listdir(src)):
            if not SEGMENT.fullmatch(name) or ".." in name:
                raise Denied("input_name_not_allowed")
            s = os.stat(name, dir_fd=src, follow_symlinks=False)
            if stat.S_ISDIR(s.st_mode):
                totals[0] += 1
                if totals[0] > MAX_FILES:
                    raise Denied("input_quota")
                child = directory(src, name)
                os.mkdir(name, 0o700, dir_fd=dst)
                target = directory(dst, name)
                try:
                    self.copy_tree(child, target, totals, depth + 1)
                finally:
                    os.close(child)
                    os.close(target)
            else:
                data = read_at(src, name)
                totals[0] += 1
                totals[1] += len(data)
                if totals[0] > MAX_FILES or totals[1] > MAX_TOTAL:
                    raise Denied("input_quota")
                fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400, dir_fd=dst)
                try:
                    with os.fdopen(fd, "wb", closefd=False) as out:
                        out.write(data)
                finally:
                    os.close(fd)

    def parent(self, segments):
        fd = os.dup(self.handles[segments[0]])
        try:
            for segment in segments[1:-1]:
                child = directory(fd, segment)
                os.close(fd)
                fd = child
            return fd
        except Exception:
            os.close(fd)
            raise

    def check_lease(self, expires):
        if not isinstance(expires, (int, float)) or expires <= time.monotonic():
            raise Denied("lease_expired")

    def invoke(self, request):
        # Controller supplies a bounded remaining lease; never trust a Worker deadline.
        if not isinstance(request, dict):
            return {"ok": False, "error": "invalid_request"}
        request_id = request.get("id")
        if not isinstance(request_id, str) or len(request_id) > 128:
            return {"ok": False, "error": "invalid_request"}
        fingerprint = digest(canonical({"name": request.get("name"), "arguments": request.get("arguments")}).encode())
        try:
            remaining = request.get("remaining_ms", 0)
            if type(remaining) not in (int, float) or not 0 < remaining <= 60000:
                raise Denied("lease_expired")
            expires = time.monotonic() + remaining / 1000
            self.check_lease(expires)
            if request_id in self.receipts:
                old = self.receipts[request_id]
                if old[0] != fingerprint:
                    raise Denied("idempotency_conflict")
                return old[1]
            self.operations += 1
            if self.operations > 1000:
                raise Denied("operation_quota")
            result = self.execute(request.get("name"), request.get("arguments"), expires)
        except Denied as error:
            result = {"ok": False, "error": str(error)}
        except (OSError, ValueError, TypeError, UnicodeError):
            # No host filenames, errno, stack or existence oracle in remote errors.
            result = {"ok": False, "error": "file_access_denied"}
        self.receipts[request_id] = (fingerprint, result)
        return result

    def execute(self, name, args, expires):
        if not isinstance(args, dict):
            raise Denied("invalid_arguments")
        expected = {"files_list": {"path"}, "files_read": {"path"}, "files_write": {"path", "content", "expected_sha256"}, "artifacts_seal": set()}
        if name not in expected or set(args) != expected[name]:
            raise Denied("tool_not_allowed")
        if name == "artifacts_seal":
            files = []
            for filename in sorted(os.listdir(self.handles["output"])):
                if not SEGMENT.fullmatch(filename) or ".." in filename:
                    raise Denied("invalid_artifact")
                data = read_at(self.handles["output"], filename)
                files.append({"path": "output/" + filename, "size": len(data), "sha256": digest(data)})
            if not files:
                raise Denied("empty_output")
            self.check_lease(expires)
            self.sealed = True
            return {"ok": True, "manifest": {"files": files, "sha256": digest(canonical(files).encode())}}
        segments = parts(args["path"])
        if name == "files_list":
            fd = os.dup(self.handles[segments[0]])
            try:
                for segment in segments[1:]:
                    child = directory(fd, segment)
                    os.close(fd)
                    fd = child
                names = sorted(os.listdir(fd))
                if len(names) > MAX_FILES:
                    raise Denied("file_count_quota")
                entries = []
                for filename in names:
                    if not SEGMENT.fullmatch(filename) or ".." in filename:
                        continue
                    info = os.stat(filename, dir_fd=fd, follow_symlinks=False)
                    if stat.S_ISDIR(info.st_mode) or (stat.S_ISREG(info.st_mode) and info.st_nlink == 1):
                        entries.append({"name": filename, "kind": "directory" if stat.S_ISDIR(info.st_mode) else "file"})
                return {"ok": True, "entries": entries}
            finally:
                os.close(fd)
        if len(segments) < 2:
            raise Denied("file_required")
        fd = self.parent(segments)
        try:
            filename = segments[-1]
            if name == "files_read":
                data = read_at(fd, filename)
                self.read_bytes += len(data)
                if self.read_bytes > 4 * MAX_TOTAL:
                    raise Denied("read_quota")
                self.check_lease(expires)
                return {"ok": True, "content": data.decode("utf-8"), "sha256": digest(data)}
            if segments[0] not in ("work", "output"):
                raise Denied("read_only_input")
            if self.sealed:
                raise Denied("artifacts_sealed")
            if not isinstance(args["content"], str):
                raise Denied("invalid_content")
            data = args["content"].encode("utf-8")
            if len(data) > MAX_FILE or self.write_bytes + len(data) > MAX_TOTAL:
                raise Denied("write_quota")
            # Writable namespaces are flat in this release. No mkdir/move/link operations.
            if len(segments) != 2:
                raise Denied("nested_write_not_supported")
            try:
                previous = digest(read_at(fd, filename))
            except FileNotFoundError:
                previous = None
            if previous != args["expected_sha256"]:
                raise Denied("version_conflict")
            if previous is None and len(os.listdir(fd)) >= MAX_FILES:
                raise Denied("file_count_quota")
            temporary = ".write-" + uuid.uuid4().hex
            handle = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
            try:
                with os.fdopen(handle, "wb", closefd=False) as out:
                    out.write(data)
                    out.flush()
                os.fsync(handle)
                self.check_lease(expires)
                os.rename(temporary, filename, src_dir_fd=fd, dst_dir_fd=fd)
                self.write_bytes += len(data)
            finally:
                os.close(handle)
                try:
                    os.unlink(temporary, dir_fd=fd)
                except FileNotFoundError:
                    pass
            return {"ok": True, "sha256": digest(data), "size": len(data)}
        finally:
            os.close(fd)


def main():
    workspace = None
    try:
        workspace = Workspace(sys.argv[1], sys.argv[2])
        print(json.dumps({"ready": True}), flush=True)
        while True:
            line = sys.stdin.buffer.readline(65537)
            if not line:
                break
            if len(line) > 65536 or not line.endswith(b"\n"):
                break  # Fail closed on malformed/unbounded framing.
            try:
                request = json.loads(line)
                result = workspace.invoke(request)
                print(json.dumps({"id": request.get("id"), "result": result}), flush=True)
            except (ValueError, AttributeError):
                break
    except Exception:
        print(json.dumps({"ready": False, "error": "workspace_start_failed"}), flush=True)
        return 1
    finally:
        if workspace:
            workspace.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
