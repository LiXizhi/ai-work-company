// Stable min-heap with decrease-key: no whole-frontier sort per A* expansion.
export function createPathQueue(){
    const heap=[],positions=new Map();let sequence=0;
    const less=(a,b)=>a.score<b.score||a.score===b.score&&a.order<b.order;
    function swap(a,b){[heap[a],heap[b]]=[heap[b],heap[a]];positions.set(heap[a].key,a);positions.set(heap[b].key,b);}
    function up(i){while(i){const p=(i-1)>>1;if(!less(heap[i],heap[p]))break;swap(i,p);i=p;}}
    return {
        get length(){return heap.length;},
        push(value,key,score){const index=positions.get(key);if(index!==undefined){if(score<heap[index].score){heap[index].score=score;heap[index].value=value;up(index);}return;}positions.set(key,heap.length);heap.push({value,key,score,order:sequence++});up(heap.length-1);},
        shift(){if(!heap.length)return;const row=heap[0],last=heap.pop();positions.delete(row.key);if(heap.length){heap[0]=last;positions.set(last.key,0);let i=0;for(;;){const a=i*2+1,b=a+1;let next=i;if(a<heap.length&&less(heap[a],heap[next]))next=a;if(b<heap.length&&less(heap[b],heap[next]))next=b;if(next===i)break;swap(i,next);i=next;}}return row.value;},
    };
}
