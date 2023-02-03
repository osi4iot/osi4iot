const fs = require('fs');
const  {mkDirByPathSync} = require('./mkDirByPathSync.js')
 


// print process.argv
const args = process.argv;
args.forEach(function (val, index, array) {
    console.log(index + ': ' + val);
});


// file='D:/documents/software/dropbox/Dropbox/Work/Project/Fibre4Yards/tasks/plans/campus nord/c1/c1_planta0.geojson'
file = process.argv[2];

var building=[];
var floors=[];
var groups=[];


fs.readFile(file, 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    throw err ;
  }

  const obj = JSON.parse(data);
  var objC = Object.assign({}, obj);
  objC.features=[];

  objC={'building':Object.assign({}, objC),'floors':Object.assign({}, objC), 'groups': []}


  obj.features.forEach( (element, index) => {
    if (element.properties.Layer.includes('building')){
        building.push(element);
    }
});



  objC.building.features=building;

  parentpath=file.split('/').slice(0,file.split('/').length-1).join('/')+('/');
  buildingpath='building/';

  dirpath=parentpath+buildingpath;
  mkDirByPathSync(dirpath)
  fs.writeFileSync(dirpath+'building.geojson', JSON.stringify(objC.building));
  

  var maxFloor=0;
  var maxGroup=0;

  obj.features.forEach((element,index) => {
    if (element.properties.Layer.includes('floor')){
        tmp=element.properties.Layer.split('_')
        if(tmp.length==2){
            floor_id = parseInt(tmp[1]);
            if (floor_id>= maxFloor){maxFloor++}

            floors.push({'id':floor_id,'element_id':index});
        }
        if(tmp.length==3){
            floor_id = parseInt(tmp[1]);
            group_name = tmp[2];
            group_id = index;
            if (floor_id> maxFloor){maxGroup++}
            
            floors.push({'id':floor_id,'element_id':group_id});
            groups.push({'Floor number':floor_id,'Feature index':floors.length-1,'Name':group_name});
        }
    }
  });

  objC.groups=groups;

  fs.writeFileSync(dirpath+`building-groups.json`, JSON.stringify(objC.groups));

for (let ifloor = 0; ifloor < maxFloor; ifloor++) {
    
    objC.floors.features=floors.map(
        ({id,element_id}) => {
            if (ifloor == id){ return obj.features[element_id]}
        })
        
        fs.writeFileSync(dirpath+`floor_${ifloor}.geojson`, JSON.stringify(objC.floors));

        let groups_array =[]
        groups.forEach(element=>{
            if (ifloor == element["Floor number"]) groups_array.push(element);
        })

        
        fs.writeFileSync(dirpath+`floor_${ifloor}_groups.json`, JSON.stringify(groups_array));
    }
    
    
    
});
