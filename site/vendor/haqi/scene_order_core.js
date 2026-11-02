// Static scenery is already sorted in the camera working set. Sort only actors.
export function mergeSceneObjects(scenery,actors){
    actors.sort((a,b)=>(a.sortY??a.y)-(b.sortY??b.y));
    const result=[];let a=0,b=0;
    while(a<scenery.length&&b<actors.length){
        if((scenery[a].sortY??scenery[a].y)<=(actors[b].sortY??actors[b].y))result.push(scenery[a++]);
        else result.push(actors[b++]);
    }
    while(a<scenery.length)result.push(scenery[a++]);
    while(b<actors.length)result.push(actors[b++]);
    return result;
}
