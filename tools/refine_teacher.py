"""Refine a rigged GLB: weld normals across UV seams and bounded Taubin smoothing.
Requires numpy and scipy. Example: python tools/refine_teacher.py source.glb refined.glb
The material/texture/rig bytes are preserved; only position/normal accessors change.
"""
import struct,json,numpy as np
from pathlib import Path
from scipy.sparse import coo_matrix
import argparse
parser=argparse.ArgumentParser(description='Smooth a rigged teacher GLB without changing UVs, topology or rig. Use an unmodified input, not repeated passes.')
parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
src=args.source.read_bytes();n=struct.unpack_from('<I',src,12)[0];g=json.loads(src[20:20+n]);raw=bytearray(src[28+n:])
def array(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dims={'VEC3':3,'VEC4':4,'VEC2':2,'SCALAR':1,'MAT4':16}[a['type']];return np.frombuffer(raw,dtype={5126:'<f4',5125:'<u4',5121:'u1'}[a['componentType']],offset=v.get('byteOffset',0)+a.get('byteOffset',0),count=a['count']*dims).reshape(a['count'],dims)
pos=array(0);old=pos.copy();normals=array(1);tri=array(5).reshape(-1,3)
_,inv=np.unique(np.round(pos,5),axis=0,return_inverse=True);count=np.bincount(inv);v=np.zeros((len(count),3));np.add.at(v,inv,pos);v/=count[:,None];original=v.copy();f=inv[tri]
edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);edges=np.unique(np.sort(edges,axis=1),axis=0);edges=edges[edges[:,0]!=edges[:,1]];rows=np.r_[edges[:,0],edges[:,1]];cols=np.r_[edges[:,1],edges[:,0]];adj=coo_matrix((np.ones(len(rows)),(rows,cols)),shape=(len(v),len(v))).tocsr();degree=np.maximum(np.asarray(adj.sum(1)),1)
for _ in range(4):
 for gain in [.35,-.36]:v+=gain*(adj@v/degree-v)
delta=v-original;limit=np.where(original[:,1]>.12,.0025,.0035);length=np.linalg.norm(delta,axis=1);v=original+delta*np.minimum(1,limit/np.maximum(length,1e-12))[:,None];pos[:]=v[inv]
face=np.cross(pos[tri[:,1]]-pos[tri[:,0]],pos[tri[:,2]]-pos[tri[:,0]])
smooth=np.zeros((len(v),3));local=np.zeros_like(pos,dtype=np.float64)
for k in range(3):np.add.at(smooth,inv[tri[:,k]],face);np.add.at(local,tri[:,k],face)
s=smooth[inv];s/=np.maximum(np.linalg.norm(s,axis=1)[:,None],1e-12);local/=np.maximum(np.linalg.norm(local,axis=1)[:,None],1e-12);dot=(s*local).sum(1);out=np.where((dot>.3)[:,None],s,local);normals[:]=out
for key,arr in [(0,pos),(1,normals)]:
 g['accessors'][key]['min']=arr.min(0).tolist();g['accessors'][key]['max']=arr.max(0).tolist()
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);raw+=b'\0'*((-len(raw))%4)
out=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(raw))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(raw),0x004e4942)+raw
args.output.write_bytes(out)
print('weld groups',len(v),'max displacement',np.linalg.norm(pos-old,axis=1).max(),'finite',np.isfinite(normals).all(),'normal length',np.linalg.norm(normals,axis=1).min())
