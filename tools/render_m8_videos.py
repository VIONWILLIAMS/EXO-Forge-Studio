"""Encode actual browser screencast frames; preserve their recorded timestamps."""
from pathlib import Path
import json, subprocess, sys, shutil
ROOT=Path(__file__).resolve().parents[1]
RECORD=ROOT/'output/v04/m8/recordings'
OUT=ROOT/'public/assets/v04/video-m8'
WORK=ROOT/'output/v04/m8/video'
OUT.mkdir(parents=True,exist_ok=True);WORK.mkdir(parents=True,exist_ok=True)
PARTS=['wide-01-assembly','wide-02-inspection','wide-03-human-motion','wide-04-three-finger','wide-05-carry','wide-06-harvest','wide-07-video-library']

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
 # ffconcat needs a closing frame for the preceding final duration to take effect.
 lines += [f"file '{file}'",'option framerate 1000']
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

def encode(mode):
 if mode=='intro':
  duration,chapters=manifest(['intro-50s'],WORK/'intro.ffconcat')
  crop=json.loads((RECORD/'intro-50s/crop.json').read_text())
  # CDP bounds the source frames to 1200 px high. Keep titles and scene subtitles.
  factor=crop.get('captureHeight',crop['innerHeight'])/crop['innerHeight'];w=int(crop['width']*factor)//2*2;h=int(crop['height']*factor)//2*2;y=int(crop['y']*factor)//2*2
  subtitle=ass_header()+dialogue(0,50,'MADE WITH ASTRA  /  M8',1490,32,19,'C8EA8E')
  (WORK/'intro.ass').write_text(subtitle)
  filters=f'trim=start=0.20:duration=50,setpts=PTS-STARTPTS,fps=30,crop={w}:{h}:0:{y},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x111b25,setsar=1,ass={WORK}/intro.ass'
  target=OUT/'ATLAS_M8_50s_Intro.mp4';limit=50;source=WORK/'intro.ffconcat'
 else:
  duration,chapters=manifest(PARTS,WORK/'product.ffconcat');limit=duration
  (WORK/'chapters.json').write_text(json.dumps(chapters,ensure_ascii=False,indent=2))
  filters='tpad=stop_mode=clone:stop_duration=0.1,fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x111b25,setsar=1'
  target=OUT/'EXO_Forge_Astra_Product_Tour_EP01_M8.mp4';source=WORK/'product.ffconcat'
 cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y','-f','concat','-safe','0','-i',str(source),'-vf',filters,'-t',str(limit),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','4','-movflags','+faststart',str(target)]
 subprocess.run(cmd,check=True)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,avg_frame_rate,nb_frames','-of','json',str(target)]))
 (WORK/(mode+'-probe.json')).write_text(json.dumps(probe,indent=2));print(json.dumps({'file':str(target),'probe':probe},ensure_ascii=False))

if __name__=='__main__':encode(sys.argv[1])
