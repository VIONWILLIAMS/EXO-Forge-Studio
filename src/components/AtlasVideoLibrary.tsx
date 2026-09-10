import { tr, useLocale } from '../i18n';
import { useRef, useState } from 'react';
import { Download, Film, X } from 'lucide-react';

export const ATLAS_VIDEOS={
  intro:{title:'ATLAS · 50 秒动作介绍',file:'ATLAS_M8_50s_Intro.mp4',detail:'从静态结构到步行、搬运、采摘与三指操作。'},
  product:{title:'Made with Astra · 产品操作实录',file:'EXO_Forge_Astra_Product_Tour_EP01_M8.mp4',detail:'在真实产品界面中查看结构、切换动作、调节机械手并下载成果。'},
};
export const atlasVideoUrl=(kind:keyof typeof ATLAS_VIDEOS)=>`/assets/v04/video-m8/${ATLAS_VIDEOS[kind].file}`;

export function AtlasVideoDownload({kind='intro'}:{kind?:keyof typeof ATLAS_VIDEOS}){
  useLocale();
  return <a className="atlas-video-download" data-testid={`download-video-${kind}`} href={atlasVideoUrl(kind)} download={ATLAS_VIDEOS[kind].file}><Download size={14}/>{tr(kind==='intro'?'下载 50 秒介绍':'下载产品实录')}<small>{tr("MP4")}</small></a>;
}

export function AtlasVideoLibrary(){
  useLocale();
  const dialog=useRef<HTMLDialogElement>(null);
  const [active,setActive]=useState<keyof typeof ATLAS_VIDEOS>('intro');
  const [open,setOpen]=useState(false),[failed,setFailed]=useState(false);
  const close=()=>{dialog.current?.close();setOpen(false);};
  return <>
    <button className="atlas-video-toggle" data-testid="video-library" onClick={()=>{setOpen(true);setFailed(false);dialog.current?.showModal();}}><Film size={16}/><span>{tr("产品视频")}</span></button>
    <dialog className="atlas-video-dialog" ref={dialog} onCancel={close} onClick={e=>{if(e.target===dialog.current)close();}} aria-label={tr("Astra 产品视频与下载")}>
      <div className="atlas-video-heading"><div><small>{tr("MADE WITH ASTRA / EP.01")}</small><h2>{tr("把设计变成可以操作的产品")}</h2></div><button onClick={close} aria-label={tr("关闭视频窗口")}><X size={20}/></button></div>
      <div className="atlas-video-tabs">{Object.entries(ATLAS_VIDEOS).map(([key,v])=><button key={key} aria-pressed={active===key} onClick={()=>{setActive(key as keyof typeof ATLAS_VIDEOS);setFailed(false);}}>{tr(v.title)}</button>)}</div>
      {open&&<video key={active} controls preload="metadata" src={atlasVideoUrl(active)} onError={()=>setFailed(true)} aria-label={tr(ATLAS_VIDEOS[active].title)}/>}
      {failed&&<p role="status">{tr("视频暂时无法加载，请刷新后重试。")}</p>}
      <div className="atlas-video-bottom"><p>{tr(ATLAS_VIDEOS[active].detail)}<small>{tr("用户定义方向，Astra 完成建模、动作与网页交互迭代。数字产品展示，非实机性能演示。")}</small></p><AtlasVideoDownload kind={active}/></div>
      <p className="atlas-video-save-note">{tr("原版录制 · 中文界面")}</p>
      <p className="atlas-video-save-note">{tr("下载到浏览器的下载目录；也可右键视频另存为。")}</p>
    </dialog>
  </>;
}
