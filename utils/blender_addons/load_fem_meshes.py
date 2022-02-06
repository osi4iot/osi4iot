import bpy
import json
import os
from pathlib import Path
from bpy_extras.io_utils import ImportHelper 
from bpy.types import Operator, OperatorFileListElement
from bpy.props import CollectionProperty, StringProperty

bl_info = {"name": "Load_FEM_meshes", "blender": (2, 93, 7), "category": "Object", "author": "Daniel Di Capua" }

class OT_LoadFemMeshes(Operator, ImportHelper): 
    bl_idname = "object.load_fem_meshes" 
    bl_label = "Load FEM meshes" 
    directory : StringProperty(subtype='DIR_PATH')
    files : CollectionProperty(type=OperatorFileListElement)
    
    def execute(self, context): 
        
        """Do something with the selected file(s)."""
        dirname= Path(self.directory)
        fileName = self.files[0].name
        filePath = os.path.join(dirname, fileName)    
        with open(filePath) as json_file:
           meshData =  json.load(json_file)
           json_file.close()

        # make collection
        femSimObjs_collection = bpy.data.collections.new('FEM simulation objects')
        bpy.context.scene.collection.children.link(femSimObjs_collection)
        
        for mesh in meshData["meshes"]:
            meshName = mesh["name"]
            vertices = []
            edges = []
            faces = []

            nodesItemSize = mesh["nodes"]["itemSize"]
            count = 0
            node_coords = []
            nodes = []
            for coord in  mesh["nodes"]["array"]:
                node_coords.append(coord)
                count+=1
                if count == nodesItemSize:
                    nodes.append(node_coords)
                    node_coords = []
                    count = 0

            elemsItemSize = mesh["elements"]["itemSize"] #Number of nodes by element
            count = 0
            elemCount = 0
            elemConnectivities = []
            for connectivity in mesh["elements"]["array"]:
                elemConnectivities.append(count)
                count+=1
                elemCount+=1

                node_coords = nodes[connectivity-1]
                vertices.append(node_coords)

                if elemCount == elemsItemSize:
                    faces.append(elemConnectivities)
                    elemConnectivities = []
                    elemCount = 0
                
            # create mesh
            mesh = bpy.data.meshes.new(meshName)
            mesh.from_pydata(vertices, edges, faces)
            mesh.update()
            # make object from mesh
            object = bpy.data.objects.new(meshName, mesh)
            object["type"]= "femSimulationObject"
            # add object to scene collection
            femSimObjs_collection.objects.link(object)

        return {'FINISHED'}
    
def menu_func(self, context):
    self.layout.separator()
    self.layout.operator(OT_LoadFemMeshes.bl_idname)

def register(): 
    bpy.utils.register_class(OT_LoadFemMeshes)
    bpy.types.VIEW3D_MT_object.append(menu_func)

def unregister(): 
    bpy.utils.unregister_class(OT_LoadFemMeshes)
    
if __name__ == "__main__": 
    register()

    # test call 
    bpy.ops.test.open_filebrowser('INVOKE_DEFAULT')