"""Encode actual browser screencast frames; preserve their recorded timestamps."""
from pathlib import Path
import json, subprocess, sys, shutil
ROOT=Path(__file__).resolve().parents[1]
RECORD=ROOT/'output/v04/m7/recordings'
OUT=ROOT/'public/assets/v04/video-m7'
WORK=ROOT/'output/v04/m7/video'
OUT.mkdir(parents=True,exist_ok=True);WORK.mkdir(parents=True,exist_ok=True)
PARTS=['01-assembly','02-inspection','03-human-motion','04-three-finger','05-carry','06-harvest','07-download']

def manifest(names,path):
 lines=['ffconcat version 1.0'];total=0;chapters=[]
 for name in names:
  folder=RECORD/name;data=json.loads((folder/'recording.json').read_text())
  if data['failure']:raise RuntimeError(data['failure'])
  frames=[f for f in data['frames'] if 0<=f['time']<data['duration']]
  if not frames:raise RuntimeError('No frames: '+name)
  times=[0]+[f['time'] for f in frames[1:]]+[data['duration']]
  chapters.append(dict(name=name,start=total,end=total+data['duration'],actions=data['actions']))
  for i,frame in enumerate(frames):
   file=str(folder/frame['file']).replace("'","'\\''")
   lines += [f"file '{file}'",'option framerate 1000',f"duration {max(.001,times[i+1]-times[i]):.6f}"]
  total+=data['duration']
 path.write_text('\n'.join(lines)+'\n');return total,chapters

def stamp(t):
 c=round(t*100);return f'{c//360000}:{c//6000%60:02d}:{c//100%60:02d}.{c%100:02d}'
def ass_header():
 return '''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,Heiti SC,30,&H00EDF2F3,&H00EDF2F3,&H0010171E,&H0010171E,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
def dialogue(start,end,text,x,y,size=30,color='EDF2F3',bold=False,layer=1):
 # ASS colors are BBGGRR.
 rgb=color;col=rgb[4:6]+rgb[2:4]+rgb[0:2]
 tag=f'{{\\pos({x},{y})\\fs{size}\\c&H{col}&\\b{1 if bold else 0}}}'
 return f'Dialogue: {layer},{stamp(start)},{stamp(end)},Default,,0,0,0,,{tag}{text}\n'

def product_ass(total,chapters):
 text=ass_header()
 text+=dialogue(0,total,'EXO FORGE',1408,65,46,bold=True)
 text+=dialogue(0,total,'MADE WITH ASTRA',1408,130,21,'C8EA8E')
 text+=dialogue(0,total,'EP.01  /  产品操作实录',1408,213,22,'91A6B0')
 text+=dialogue(0,total,'用户定义方向\\NAstra 完成建模、动作\\N与网页交互迭代',1408,866,24,'9EB1B9')
 text+=dialogue(0,total,'数字概念展示 · 非实机验证',1408,1015,18,'6F8997')
 titles=[('看得见，也能操作','从总装到内部骨架\\N切换视角，展开结构\\N让每一层设计都可查看'),('结构细节，经得起查看','尺寸、剖切、透明图层\\N模块信息与模拟设备屏\\N连接设计与工程讨论'),('让人体动作更自然','人体参考曲线与三维姿态\\N走、跑、深蹲与单腿支撑\\N在同一界面中逐项检查'),('三指机械手，自由调节','肩、肘、前臂与手腕\\N左右独立，三指可开合\\N近看真实关节与操作'),('把能力放进任务里','深蹲取箱，双手扶稳箱边\\N机械臂抓持，连续上楼\\N在平台落箱后自然收手'),('人体提篮，机械臂采摘','从枝头摘下苹果\\N移向篮口，松开放入\\N完成一次连续协作'),('成果，可以带走','50 秒动作介绍直接下载\\N真实产品界面保留在实录\\N让讨论有可以观看的成果')]
 for i,(chapter,description) in enumerate(zip(chapters,titles)):
  start,end=chapter['start'],chapter['end'];title,body=description
  # Explicit line breaks keep the right editorial column within 470 px.
  title=title.replace('让人体动作更自然','让人体动作\\N更自然').replace('三指机械手，自由调节','三指机械手\\N自由调节').replace('人体提篮，机械臂采摘','人体提篮\\N机械臂采摘').replace('结构细节，经得起查看','结构细节\\N经得起查看')
  text+=dialogue(start,end,f'{i+1:02d} / {len(chapters):02d}',1408,292,21,'C8EA8E')
  text+=dialogue(start,end,title,1408,343,34,bold=True)
  text+=dialogue(start,end,body,1408,502,27,'BDCDD3')
  actions=chapter['actions']
  for j,a in enumerate(actions):
   lo=start+a['at'];hi=start+(actions[j+1]['at'] if j+1<len(actions) else end-start)
   if hi>lo:text+=dialogue(lo,hi,'正在操作\\N'+a['label'],1408,698,22,'C8EA8E')
 return text

def encode(mode):
 if mode=='intro':
  duration,chapters=manifest(['intro-50s'],WORK/'intro.ffconcat')
  crop=json.loads((RECORD/'intro-50s/crop.json').read_text())
  # CDP bounds the source frames to 1200 px high. Keep titles and scene subtitles.
  factor=1200/crop['innerHeight'];w=int(crop['width']*factor)//2*2;h=int(crop['height']*factor)//2*2;y=int(crop['y']*factor)//2*2
  subtitle=ass_header()+dialogue(0,50,'MADE WITH ASTRA  /  M7',1490,32,19,'C8EA8E')
  (WORK/'intro.ass').write_text(subtitle)
  filters=f'trim=start=0.20:duration=50,setpts=PTS-STARTPTS,fps=30,crop={w}:{h}:0:{y},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x111b25,setsar=1,ass={WORK}/intro.ass'
  target=OUT/'ATLAS_M7_50s_Intro.mp4';limit=50;source=WORK/'intro.ffconcat'
 else:
  duration,chapters=manifest(PARTS,WORK/'product.ffconcat');limit=duration
  (WORK/'product.ass').write_text(product_ass(duration,chapters))
  (WORK/'chapters.json').write_text(json.dumps(chapters,ensure_ascii=False,indent=2))
  filters=f'fps=30,scale=1368:1080:force_original_aspect_ratio=decrease,pad=1920:1080:0:(oh-ih)/2:color=0x10171e,setsar=1,drawbox=x=1368:y=0:w=1:h=1080:color=0x3b4c58:t=fill,drawbox=x=1408:y=263:w=462:h=2:color=0xc8ea8e:t=fill,ass={WORK}/product.ass'
  target=OUT/'EXO_Forge_Astra_Product_Tour_EP01.mp4';source=WORK/'product.ffconcat'
 cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y','-f','concat','-safe','0','-i',str(source),'-vf',filters,'-t',str(limit),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','4','-movflags','+faststart',str(target)]
 subprocess.run(cmd,check=True)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,avg_frame_rate,nb_frames','-of','json',str(target)]))
 (WORK/(mode+'-probe.json')).write_text(json.dumps(probe,indent=2));print(json.dumps({'file':str(target),'probe':probe},ensure_ascii=False))

if __name__=='__main__':encode(sys.argv[1])
