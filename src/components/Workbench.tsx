import { LanguageSwitch } from "./LanguageSwitch";
import { tr, useLocale } from '../i18n';
import { Box, BoxSelect, Camera, ChevronDown, CircleDot, Download, Eye, EyeOff, Focus, Gauge, Layers3, Maximize2, Pause, Play, Redo2, Rotate3D, Ruler, Save, ScanLine, Search, Settings2, Undo2, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { calculateAnalysis } from '../lib/analysis'
import { manifestById, MODULE_MANIFEST } from '../lib/manifest'
import { BASE_CONFIG, parseConfig, useExoStore } from '../lib/store'
import type { ExoDesignConfig, HumanDimensions, JointState, MachineDimensions, ScenarioPreset } from '../lib/types'
import { ExoScene } from './ExoScene'

declare global {
  interface Window {
    __EXO_DEBUG__: {
      getConfig: () => ExoDesignConfig
      setScenario: (preset: ScenarioPreset) => void
      setParameter: (path: string, value: number) => boolean
      selectModule: (id: string) => void
      getAnalysis: () => ReturnType<typeof calculateAnalysis>
      reset: () => void
    }
  }
}

const GROUPS = [
  { code: 'H', label: '人体界面', subtitle: 'HUMAN INTERFACE' }, { code: 'F', label: '躯干承力', subtitle: 'LOAD FRAME' },
  { code: 'L', label: '主动下肢', subtitle: 'LOWER LIMB' }, { code: 'A', label: '七轴机械臂', subtitle: 'ROBOTIC ARM' }, { code: 'P', label: '动力与支撑', subtitle: 'POWER / SUPPORT' },
]

function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Workbench() {
  useLocale();
  const config = useExoStore((s) => s.config), selected = useExoStore((s) => s.selectedModule), setSelected = useExoStore((s) => s.setSelected)
  const hidden = useExoStore((s) => s.hiddenModules), toggleHidden = useExoStore((s) => s.toggleModuleVisibility), isolated = useExoStore((s) => s.isolatedModule), isolateSelected = useExoStore((s) => s.isolateSelected)
  const cameraView = useExoStore((s) => s.cameraView), setCameraView = useExoStore((s) => s.setCameraView), projection = useExoStore((s) => s.projection), toggleProjection = useExoStore((s) => s.toggleProjection)
  const explode = useExoStore((s) => s.explode), setExplode = useExoStore((s) => s.setExplode), section = useExoStore((s) => s.sectionEnabled), toggleSection = useExoStore((s) => s.toggleSection), measure = useExoStore((s) => s.measureEnabled), toggleMeasure = useExoStore((s) => s.toggleMeasure)
  const analysisOpen = useExoStore((s) => s.analysisOpen), toggleAnalysis = useExoStore((s) => s.toggleAnalysis), timeline = useExoStore((s) => s.timeline), setTimeline = useExoStore((s) => s.setTimeline), playing = useExoStore((s) => s.playing), togglePlaying = useExoStore((s) => s.togglePlaying)
  const past = useExoStore((s) => s.past), future = useExoStore((s) => s.future), undo = useExoStore((s) => s.undo), redo = useExoStore((s) => s.redo), applyPreset = useExoStore((s) => s.applyPreset), snapshots = useExoStore((s) => s.snapshots)
  const setHuman = useExoStore((s) => s.setHuman), setMachine = useExoStore((s) => s.setMachine), setJoint = useExoStore((s) => s.setJoint), setLoad = useExoStore((s) => s.setLoad), toggleVisibility = useExoStore((s) => s.toggleVisibility)
  const createSnapshot = useExoStore((s) => s.createSnapshot), restoreSnapshot = useExoStore((s) => s.restoreSnapshot), importConfig = useExoStore((s) => s.importConfig)
  const [search, setSearch] = useState(''), [fps, setFps] = useState(60), [toast, setToast] = useState(''), [modelMode, setModelMode] = useState<'cad' | 'concept'>('cad'), fileInput = useRef<HTMLInputElement>(null), modelRef = useRef<THREE.Group | null>(null)
  const analysis = useMemo(() => calculateAnalysis(config), [config]), selectedInfo = manifestById[selected] ?? MODULE_MANIFEST[0]

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 1800) }
  useEffect(() => { if (!playing) return; const timer = window.setInterval(() => { const state = useExoStore.getState(); state.setTimeline(state.timeline >= 100 ? 0 : state.timeline + 2) }, 70); return () => window.clearInterval(timer) }, [playing])
  useEffect(() => {
    window.__EXO_DEBUG__ = {
      getConfig: () => structuredClone(useExoStore.getState().config), setScenario: (preset) => useExoStore.getState().applyPreset(preset),
      setParameter: (path, value) => { const [sectionName, key] = path.split('.'); const state = useExoStore.getState(); if (sectionName === 'human' && key in state.config.human) state.setHuman(key as keyof HumanDimensions, value); else if (sectionName === 'machine' && key in state.config.machine) state.setMachine(key as keyof MachineDimensions, value); else if (sectionName === 'joints' && key in state.config.joints) state.setJoint(key as keyof JointState, value); else if (sectionName === 'loadCase' && (key === 'massKg' || key === 'reachMm')) state.setLoad(key, value); else return false; return true },
      selectModule: (id) => useExoStore.getState().setSelected(id), getAnalysis: () => calculateAnalysis(useExoStore.getState().config), reset: () => useExoStore.getState().reset(),
    }
  }, [])

  const exportJson = () => { download(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }), `exo-forge-${config.preset}-v01.json`); notify('配置 JSON 已导出') }
  const capturePng = () => { const canvas = document.querySelector('canvas'); if (!canvas) return notify('未找到三维画布'); canvas.toBlob((blob) => { if (blob) { download(blob, `exo-forge-${config.preset}.png`); notify('当前视图 PNG 已导出') } }, 'image/png') }
  const exportGlb = async () => { if (!modelRef.current) return notify('模型仍在初始化'); const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js'); new GLTFExporter().parse(modelRef.current, (result) => { if (result instanceof ArrayBuffer) { download(new Blob([result], { type: 'model/gltf-binary' }), `exo-forge-${config.preset}.glb`); notify('当前配置 GLB 已导出') } }, (error) => { console.error(error); notify('GLB 导出失败') }, { binary: true, onlyVisible: true }) }
  const downloadCadPack = () => { const anchor = document.createElement('a'); anchor.href = '/assets/EXO_FORGE_CAD_V02_PRINT_PACK.zip'; anchor.download = 'EXO_FORGE_CAD_V02_PRINT_PACK.zip'; anchor.click(); notify('STEP / STL / 3MF 打印整包开始下载') }
  const importFile = async (file?: File) => { if (!file) return; const next = parseConfig(await file.text()); importConfig(next); notify('配置已导入并完成 schema 校验') }
  const saveVersion = () => { createSnapshot(`V0.1 · ${new Date().toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' })}`); notify('本地版本快照已保存') }

  return <main className={`app-shell ${analysisOpen ? '' : 'analysis-collapsed'}`}>
    <header className="topbar">
      <div className="brand-mark">{tr("XF")}</div><div className="brand"><b>{tr("EXO FORGE")}</b><span>{tr("STUDIO · CAD V0.2")}</span></div>
      <div className="file-pill"><span className="status-dot" />{tr("EXF-IND-001 / ")}{tr(config.preset === 'industrial' ? '工业搬运' : config.preset === 'rescue' ? '救援' : '建筑施工')} <ChevronDown size={13} /></div>
      <LanguageSwitch/><nav className="tool-row" aria-label={tr("文件与历史工具")}>
        <Tool title={tr("撤销")} testId="undo" onClick={undo} disabled={!past.length}><Undo2/></Tool><Tool title={tr("重做")} testId="redo" onClick={redo} disabled={!future.length}><Redo2/></Tool><span className="tool-divider"/>
        <Tool title={tr("保存版本快照")} testId="save-snapshot" onClick={saveVersion}><Save/></Tool><Tool title={tr("导入 JSON")} onClick={() => fileInput.current?.click()}><Upload/></Tool><Tool title={tr("导出配置 JSON")} testId="export-json" onClick={exportJson}><Download/></Tool><Tool title={tr("下载 STEP / STL / 3MF 打印整包")} testId="download-cad-pack" onClick={downloadCadPack}><Box/></Tool><Tool title={tr("导出当前视图 GLB")} testId="export-glb" onClick={exportGlb}><BoxSelect/></Tool><Tool title={tr("导出当前视图 PNG")} testId="export-png" onClick={capturePng}><Camera/></Tool>
      </nav>
      <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(e) => importFile(e.target.files?.[0])}/>
      <div className={`health health-${analysis.stabilityState}`}><span>{tr("设计辅助")}</span><b>{tr(analysis.stabilityState === 'safe' ? '稳定' : analysis.stabilityState === 'warning' ? '注意' : '超限')}</b><span className="health-light" /></div>
    </header>

    <aside className="assembly-panel">
      <div className="panel-title"><div><span>{tr("ASSEMBLY")}</span><b>{tr("装配结构")}</b></div><button className={isolated ? 'mini-action active' : 'mini-action'} title={tr("隔离当前模块")} onClick={isolateSelected}><Focus size={15}/></button></div>
      <label className="search"><Search size={14}/><input aria-label={tr("搜索模块")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("搜索模块 / 接口")} />{tr(search && <button onClick={()=>setSearch('')}><X size={12}/></button>)}</label>
      <div className="root-node"><ChevronDown size={14}/><span className="root-icon"><Box size={13}/></span><b>{tr("EXO-FORGE / 20 模块族")}</b><small>{MODULE_MANIFEST.reduce((sum,item)=>sum+item.glbNodes.length,0)}{tr(" 节点")}</small></div>
      <div className="tree-list detailed">{GROUPS.map((group) => { const items = MODULE_MANIFEST.filter((item) => item.id.startsWith(group.code) && `${item.id} ${item.name} ${tr(item.name)}`.toLowerCase().includes(search.toLowerCase())); if (!items.length) return null; return <section className="tree-family" key={group.code}><div className="tree-family-title"><ChevronDown size={12}/><span className={`module-code code-${group.code}`}>{tr(group.code)}</span><b>{tr(group.label)}</b><small>{items.length}</small></div>{items.map((item) => <div className={`module-row ${selected===item.id?'active':''} ${hidden.includes(item.id)?'muted':''}`} key={item.id}><button data-testid={`module-${item.id}`} onClick={()=>setSelected(item.id)}><i>{tr(item.id)}</i><span><b>{tr(item.name)}</b><small>{tr(item.glbNodes.join(' · '))}</small></span></button><button className="eye-button" aria-label={tr(hidden.includes(item.id)?'显示 {0}':'隐藏 {0}', [item.id])} onClick={()=>toggleHidden(item.id)}>{hidden.includes(item.id)?<EyeOff size={12}/>:<Eye size={12}/>}</button></div>)}</section>})}</div>
      <div className="layer-block compact"><span>{tr("显示图层")}</span><LayerToggle label="工业数字人" checked={config.visibility.human} onChange={()=>toggleVisibility('human')}/><LayerToggle label="线束 / 液路" checked={config.visibility.utilities} onChange={()=>toggleVisibility('utilities')}/><LayerToggle label="任务载荷" checked={config.visibility.payload} onChange={()=>toggleVisibility('payload')}/></div>
      {isolated && <div className="isolation-bar"><Focus size={12}/>{tr("已隔离 {0}", [isolated])}<button onClick={isolateSelected}>{tr("退出")}</button></div>}
    </aside>

    <section className="viewport-panel">
      <div className="viewport-head">
        <div className="scenario-tabs">{([['industrial','工业搬运'],['rescue','救援'],['construction','建筑施工']] as const).map(([key,label]) => <button data-testid={`preset-${key}`} key={key} className={config.preset===key?'active':''} onClick={()=>applyPreset(key)}>{tr(label)}<small>{tr(key==='industrial'?'50 kg · 500 mm':key==='rescue'?'20 kg · 低位':'15 kg · 高位')}</small></button>)}</div>
        <div className="viewport-tools"><div className="model-mode-switch"><button data-testid="mode-cad" className={modelMode==='cad'?'active':''} onClick={()=>setModelMode('cad')}>{tr("CAD 实体")}<small>{tr("35 B-REP")}</small></button><button data-testid="mode-concept" className={modelMode==='concept'?'active':''} onClick={()=>setModelMode('concept')}>{tr("动作概念")}<small>{tr("实时参数")}</small></button></div><div className="view-buttons">{(['iso','front','side','top'] as const).map((view)=><button key={view} className={cameraView===view?'active':''} onClick={()=>setCameraView(view)}>{tr(view==='iso'?'轴测':view==='front'?'正':view==='side'?'侧':'顶')}</button>)}</div><button className={`view-chip ${projection==='orthographic'?'active':''}`} onClick={toggleProjection}><CircleDot size={12}/> {tr(projection==='perspective'?'透视':'正交')}</button></div>
      </div>
      <div className="scene-wrap"><ExoScene modelRef={modelRef} mode={modelMode} onFps={setFps}/><div className="axis"><b>{tr("Z")}</b><span className="x">{tr("X")}</span><span className="y">{tr("Y")}</span></div><div className="scale-readout">{tr(modelMode==='cad'?'1:5 PRINT':'1.75 m')} <span>{tr(modelMode==='cad'?'视口按名义尺寸显示':'人体基准')}</span></div><div className="mode-stack"><Tool title={tr("适配视图")} onClick={()=>setCameraView('iso')}><Maximize2/></Tool><Tool title={tr("X-Ray 人体")} active={config.visibility.xrayHuman} onClick={()=>toggleVisibility('xrayHuman')}><Layers3/></Tool><Tool title={tr("爆炸图")} testId="explode" active={explode>0} onClick={()=>setExplode(explode?0:1)}><Rotate3D/></Tool><Tool title={tr("测量")} testId="measure" active={measure} onClick={toggleMeasure}><Ruler/></Tool><Tool title={tr("剖切")} testId="section" active={section} onClick={toggleSection}><ScanLine/></Tool><Tool title={tr("隔离选择")} active={Boolean(isolated)} onClick={isolateSelected}><Focus/></Tool></div><div className={`concept-badge ${modelMode==='cad'?'safe':analysis.stabilityState}`}><span>{tr(modelMode==='cad'?'CAD VALIDATION':'CONCEPT ASSIST')}</span><b>{tr(modelMode==='cad'?'35/35 水密实体 · 4 张打印板':analysis.warnings.length ? `${analysis.warnings.length} 项需要检查` : '几何与限位正常')}</b></div></div>
      <div className="viewport-footer"><span><i className="live-dot"/>{tr(modelMode==='cad'?'OpenCascade 实体派生预览':'实时参数化概念模型')}</span><span>{tr("毫米 · STEP · STL · 3MF")}</span><span>{tr(modelMode==='cad'?'B-REP / WebGL2':'ACES / WebGL2')}</span><span>{tr("帧率 ")}<b>{fps}</b></span></div>
    </section>

    <aside className="property-panel">
      <div className="panel-title sticky"><div><span>{tr("INSPECTOR")}</span><b>{tr("属性与约束")}</b></div><Gauge size={16}/></div>
      <div className="selection-card"><span>{tr("当前选择 · ")}{tr(selectedInfo.side==='B'?'左右独立件':selectedInfo.side)}</span><b>{tr(selectedInfo.id)} / {tr(selectedInfo.name)}</b><small>{tr("节点：")}{tr(selectedInfo.glbNodes.join(' · '))}</small></div>
      {modelMode==='cad' && <div className="cad-mode-note"><b>{tr("CAD V0.2 固定实体")}</b><span>{tr("当前显示由 STEP 同源实体派生。右侧人体/机构参数用于下一次 CAD 重建，不会伪装成浏览器内制造级改形。")}</span><em>{tr("最小壁厚 2.4 mm · 孔径 3.4 mm · M3")}</em></div>}
      <InspectorSection title={tr("人体适配")} code="HUMAN FIT"><Range label="身高" value={config.human.heightMm} unit="mm" min={1650} max={1850} onChange={(v)=>setHuman('heightMm',v)}/><Range label="肩宽" value={config.human.shoulderWidthMm} unit="mm" min={400} max={520} onChange={(v)=>setHuman('shoulderWidthMm',v)}/><Range label="髋宽" value={config.human.hipWidthMm} unit="mm" min={320} max={440} onChange={(v)=>setHuman('hipWidthMm',v)}/></InspectorSection>
      <InspectorSection title={tr("机构几何")} code="MECHANISM"><Range label="肩框" value={config.machine.shoulderFrameMm} unit="mm" min={680} max={840} onChange={(v)=>setMachine('shoulderFrameMm',v)}/><Range label="骨盆环" value={config.machine.pelvisRingMm} unit="mm" min={460} max={600} onChange={(v)=>setMachine('pelvisRingMm',v)}/><Range label="腿长" value={config.machine.legLengthMm} unit="mm" min={780} max={1000} onChange={(v)=>setMachine('legLengthMm',v)}/><Range label="外臂有效臂展" value={config.machine.armReachMm} unit="mm" min={800} max={1150} onChange={(v)=>setMachine('armReachMm',v)}/><Range label="支腿跨度" value={config.machine.outriggerSpanMm} unit="mm" min={760} max={1400} onChange={(v)=>setMachine('outriggerSpanMm',v)}/></InspectorSection>
      <InspectorSection title={tr("载荷工况")} code="LOAD CASE"><Range label="载荷质量" value={config.loadCase.massKg} unit="kg" min={0} max={80} step={1} onChange={(v)=>setLoad('massKg',v)}/><Range label="前伸距离" value={config.loadCase.reachMm} unit="mm" min={100} max={900} onChange={(v)=>setLoad('reachMm',v)}/></InspectorSection>
      <InspectorSection title={tr("关节姿态")} code="JOINTS"><Range label="肩俯仰" value={config.joints.shoulderPitchDeg} unit="°" min={-90} max={120} onChange={(v)=>setJoint('shoulderPitchDeg',v)}/><Range label="肘屈曲" value={config.joints.elbowDeg} unit="°" min={0} max={145} onChange={(v)=>setJoint('elbowDeg',v)}/><Range label="髋俯仰" value={config.joints.hipPitchDeg} unit="°" min={-30} max={100} onChange={(v)=>setJoint('hipPitchDeg',v)}/><Range label="膝屈曲" value={config.joints.kneeDeg} unit="°" min={0} max={120} onChange={(v)=>setJoint('kneeDeg',v)}/></InspectorSection>
      <InspectorSection title={tr("接口与安全")} code="CONSTRAINTS"><div className="manifest-facts"><span>{tr("局部轴 ")}<b>[{tr(selectedInfo.localAxis.join(', '))}]</b></span><span>{tr("连接接口 ")}<b>{selectedInfo.connectionInterfaces.length}</b></span>{selectedInfo.safetyLabels.map(label=><em key={label}>{tr(label)}</em>)}</div><div className={`constraint ${analysis.warnings.some(w=>w.moduleId===selected)?'warn':''}`}><span>{tr("机械限位 / 间隙")}</span><b>{tr(analysis.warnings.some(w=>w.moduleId===selected)?'⚠ 当前模块需要复核':'✓ 当前模块检查通过')}</b></div></InspectorSection>
      {snapshots.length>0 && <InspectorSection title={tr("本地版本")} code={tr("{0} 个快照", [snapshots.length])}><div className="snapshot-list">{snapshots.slice(0,4).map(item=><button key={item.id} onClick={()=>restoreSnapshot(item.id)}><span>{tr(item.label)}</span><small>{tr(new Date(item.createdAt).toLocaleString(document.documentElement.lang))}</small></button>)}</div></InspectorSection>}
    </aside>

    <section className="analysis-dock">
      <button className="analysis-title" onClick={toggleAnalysis}><span>{tr("ANALYSIS DOCK")}</span><b>{tr("概念设计辅助 · 非 FEA")}</b><ChevronDown className={analysisOpen?'':'closed'} size={15}/></button>
      {analysisOpen && <><Metric label="稳定余量" value={`${analysis.stabilityMarginMm}`} unit="mm" state={analysis.stabilityState}/><Metric label="单臂静态力矩" value={`${analysis.approximateTorqueNmPerArm.toFixed(1)}`} unit="N·m / 臂" state={analysis.approximateTorqueNmPerArm>180?'warning':'safe'}/><Metric label="最小人体间隙" value={`${analysis.minimumHumanClearanceMm}`} unit="mm" state={analysis.minimumHumanClearanceMm<30?'critical':analysis.minimumHumanClearanceMm<50?'warning':'safe'}/>
      <div className="support-map"><span>{tr("支撑多边形 / COM")}</span><div><i className="foot l"/><i className="foot r"/><i className="com" style={{left:`calc(50% + ${analysis.comProjectionMm[0]/12}px)`,top:`calc(48% - ${analysis.comProjectionMm[1]/12}px)`}}/></div><b className={analysis.stabilityState}>{tr(analysis.stabilityState==='critical'?'投影越界':`内侧 ${analysis.stabilityMarginMm} mm`)}</b></div>
      <div className="timeline-panel"><div><button onClick={togglePlaying}>{playing?<Pause size={13}/>:<Play size={13}/>}</button><span>{tr("动作时间轴")}</span><output>{tr(timeline.toFixed(0))}%</output></div><input aria-label={tr("动作时间轴")} type="range" min="0" max="100" value={timeline} onChange={(e)=>setTimeline(Number(e.target.value))}/><div className="ticks"><i/><i/><i/><i/><i/></div>{analysis.warnings[0]?<button className={`warning-line ${analysis.warnings[0].severity}`} onClick={()=>setSelected(analysis.warnings[0].moduleId)}><b>{tr(analysis.warnings[0].code)}</b><span>{tr(analysis.warnings[0].message)}</span></button>:<div className="warning-line ok"><b>{tr("CHECK")}</b><span>{tr("当前配置无超限告警")}</span></div>}</div></>}
    </section>
    {toast && <div role="status" className="toast"><span/>{tr(toast)}</div>}
  </main>
}

function Tool({title,onClick,children,active,disabled,testId}:{title:string;onClick:()=>void;children:React.ReactNode;active?:boolean;disabled?:boolean;testId?:string}) {
  useLocale(); return <button data-testid={testId} aria-label={tr(title)} title={tr(title)} className={`tool ${active?'active':''}`} disabled={disabled} onClick={onClick}>{tr(children)}</button> }
function LayerToggle({label,checked,onChange}:{label:string;checked:boolean;onChange:()=>void}) {
  useLocale(); return <label><input type="checkbox" checked={checked} onChange={onChange}/>{tr(label)}<em>{tr(checked?'ON':'OFF')}</em></label> }
function InspectorSection({title,code,children}:{title:string;code:string;children:React.ReactNode}) {
  useLocale(); return <section className="prop-section"><h3>{tr(title)}<em>{tr(code)}</em></h3>{tr(children)}</section> }
function Range({label,value,unit,min,max,step=1,onChange}:{label:string;value:number;unit:string;min:number;max:number;step?:number;onChange:(value:number)=>void}) {
  useLocale(); return <div className="control"><div><label>{tr(label)}</label><output data-testid={`value-${label}`}>{Math.round(value*10)/10}<small>{tr(unit)}</small></output></div><input data-testid={`control-${label}`} aria-label={tr(label)} type="range" min={min} max={max} step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))}/><div className="range"><span>{min}</span><span>{max}</span></div></div> }
function Metric({label,value,unit,state}:{label:string;value:string;unit:string;state:'safe'|'warning'|'critical'}) {
  useLocale(); return <div className="metric"><span>{tr(label)}</span><div><b className={state}>{tr(value)}</b><small>{tr(unit)}</small></div><i className={state}/></div> }
