import { tr, useLocale } from '../i18n';
import {
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Focus,
  Layers3,
  Maximize,
  MoveUpRight,
  PanelRightClose,
  Rotate3D,
  Ruler,
  ScanLine,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
  Camera,
  Monitor,
  Sun,
  Power,
  Activity,
  Film,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { AtlasScene, type AtlasLayers, type AtlasView } from "./AtlasScene";
import type { HmiMode } from "./HmiScreens";
import { MOTION_CLIPS } from '../domain/atlasMotion';
import { useAtlasMotion } from '../state/atlasMotionStore';
import { AtlasMotionPanel, AtlasScenarioOverlay, AtlasScenarioInspector } from './AtlasMotionPanel';
import { AtlasArmInspector } from './AtlasArmInspector';
import { AtlasGaitInspector } from './AtlasGaitReference';
import { AtlasVideoLibrary } from './AtlasVideoLibrary';
import { LanguageSwitch } from "./LanguageSwitch";
import { AtlasMotionWorkbench } from './AtlasMotionWorkbench';

type CadPart = {
  id: string;
  family: string;
  name: string;
  material: string;
  layer: string;
  process: string;
  notes: string;
  validBRep: boolean;
  watertight: boolean;
  boundsMm: number[];
  quantity: number;
};
type Assembly = {
  parts: CadPart[];
  instances: unknown[];
  config: { revision: string };
};
const MODULES: Record<
  string,
  { name: string; detail: string; dimensions: string; interface: string }
> = {
  H01: {
    name: "胸背承托与快卸",
    detail: "分层棱面胸板、软接触垫与肩部织带。中央开口集成独立显示终端。",
    dimensions: "270 × 200 mm 承托范围",
    interface: "软垫 · 织带 · 快卸胸扣",
  },
  H02: {
    name: "腿部承托环",
    detail: "开放式承托环连接腿侧导轨，保留膝后屈曲空间。",
    dimensions: "154 × 158 mm 名义包络",
    interface: "软衬 · 连接耳 · M5 安装孔",
  },
  H03: {
    name: "人体侧主控臂",
    detail:
      "补齐肘轴到握把的连接段；左侧新增显示器固定支架。控制路径与承载路径分开。",
    dimensions: "136 mm 上段 · 95 mm 下连杆",
    interface: "转轴 → 下连杆 → 固定套 → 握把",
  },
  F01: {
    name: "肩胛承力桥",
    detail: "机械臂反力经肩部支座汇入背部桥架，再沿双轨传递到骨盆。",
    dimensions: "640 mm 桥架跨度",
    interface: "Ø8.5 安装孔 · 双侧驱动座",
  },
  F02: {
    name: "双轨脊柱承力梁",
    detail: "两条封闭导轨与独立滑块形成纵向承力路径，分节背甲覆盖夹点。",
    dimensions: "370 mm 导轨 · 124 mm 中心距",
    interface: "调整滑块 · 分节防夹罩",
  },
  F03: {
    name: "骨盆承力鞍",
    detail: "围绕髋部的后侧承力弧框，前侧保留穿脱开口。",
    dimensions: "456 × 310 mm 名义包络",
    interface: "髋支座 · 背轨 · 前开口",
  },
  L01: {
    name: "髋驱动总成",
    detail: "驱动壳、输出法兰、轴承占位环与端盖分件建模；真实轴承型号待选。",
    dimensions: "Ø92 mm 驱动壳 · 36 mm 宽",
    interface: "8 × Ø4.5 法兰孔",
  },
  L02: {
    name: "大腿承力与曲面护壳",
    detail: "封闭管承力，外侧薄壁曲面护壳可拆。护壳与承托环分别安装。",
    dimensions: "350 mm 承力管 · 3 mm 护壳",
    interface: "闭口管 · 承托连接耳",
  },
  L03: {
    name: "膝关节驱动总成",
    detail: "以人体膝部高度为装配基准，驱动壳置于腿外侧，露出法兰与紧固件。",
    dimensions: "478 mm 轴心高度 · Ø86 mm",
    interface: "同轴法兰 · 轴承占位",
  },
  L04: {
    name: "小腿随形承力链",
    detail: "沿胫侧向踝部收拢。走线沿导轨后缘布置，前侧护壳可单独拆卸。",
    dimensions: "278 mm 承力管 · 3 mm 护壳",
    interface: "上接膝总成 · 下接踝叉",
  },
  L05: {
    name: "踝关节与双耳叉",
    detail: "叉架向下包到鞋侧，将小腿承力链接入足跟与足弓支撑。",
    dimensions: "112 mm 轴心高度 · Ø12 轴孔",
    interface: "Ø12 转轴 · 2 × Ø5.5 安装孔",
  },
  L06: {
    name: "随鞋足跟与分段前掌",
    detail:
      "鞋跟杯包住后跟，足弓板贴合鞋底；前掌在横向铰链处分段，保留蹬地弯折。",
    dimensions: "286 × 124 mm · 6 mm 足板",
    interface: "Ø8 实心销轴 · Ø8.4 样件轴孔 · 端部限位",
  },
  A01: {
    name: "机械臂肩部动力座",
    detail: "偏航基座、正交叉架与驱动法兰分层；肩峰护罩独立拆装。",
    dimensions: "Ø112 mm 驱动壳 · 48 mm 宽",
    interface: "偏航座 · 叉架 · 输出法兰",
  },
  A02: {
    name: "机械臂上臂模组",
    detail: "内部双壁承力管与外部通风护壳分离，连续曲面包住主要机构。",
    dimensions: "268 mm 承力段 · 3 mm 护壳",
    interface: "法兰端部 · 服务走线",
  },
  A03: {
    name: "机械臂肘部总成",
    detail: "肘部驱动壳、法兰、端盖和轴承环拆分呈现，便于检查装配顺序。",
    dimensions: "Ø96 mm 驱动壳 · 40 mm 宽",
    interface: "8 × Ø4.5 · 前臂承力段",
  },
  A04: {
    name: "前臂、腕部与夹持器",
    detail: "前臂滚转支承、腕部总成与工具接口分件，三指机械手摩擦垫可更换。",
    dimensions: "Ø50 mm 工具孔距 · 4 × Ø5.5",
    interface: "滚转支承 · 腕法兰 · 工具座",
  },
  P01: {
    name: "双电源匣背包",
    detail: "双匣电源包络与承载壳分离，顶部锁扣用于装配审查。",
    dimensions: "206 × 90 × 292 mm 载架",
    interface: "可抽取电源匣 · 顶部锁扣",
  },
  P02: {
    name: "三处人机终端与控制器",
    detail:
      "胸前状态屏、前臂操纵屏和背部维护屏。底壳、边框与盖板为独立 CAD 零件；显示内容为设计模拟。",
    dimensions: "胸屏 120 × 64 · 腕屏 64 × 38 mm",
    interface: "屏幕盖板 · 固定边框 · 底壳 · 独立急停",
  },
  P03: {
    name: "收纳式辅助支撑",
    detail: "辅助支撑收纳于背轨后方；当前站姿由随鞋脚部接地。",
    dimensions: "245 mm 收纳段",
    interface: "收纳状态 · 不计入接地面积",
  },
  P04: {
    name: "走线、快接与散热",
    detail: "线束沿背部与关节外侧绕行，服务环、密封接头与鳍片独立显示。",
    dimensions: "5 路背部快接 · 9 片散热鳍",
    interface: "服务环 · 密封接头 · 冷却通道",
  },
};
const GROUPS = [
  ["H", "人体接口"],
  ["F", "躯干承力"],
  ["A", "外部机械臂"],
  ["L", "下肢与随鞋支撑"],
  ["P", "动力与服务"],
];
const VIEWS: [AtlasView, string][] = [
  ["hero", "轴测"],
  ["front", "正面"],
  ["rear", "背面"],
  ["side", "侧面"],
  ["foot", "足部"],
  ["hmi", "屏幕"],
  ["fit", "人因"],
];
const DRAWING_PARTS = new Set([
  "L06_HEEL_PLATE",
  "L06_FOREFOOT_PLATE",
  "L05_ANKLE_FORK",
  "A01_FLANGE",
  "A03_FLANGE",
  "A04_TOOL_FLANGE",
  "F01_SCAPULAR_BRIDGE",
  "L02_TIE_LUG",
  "P02_HMI_CHEST_BEZEL",
  "L06_HINGE_HEEL",
  "L06_HINGE_TOE",
]);

export function AtlasWorkbench() {
  useLocale();
  const motionEnabled=useAtlasMotion(s=>s.enabled);
  const sequence=useAtlasMotion(s=>s.sequence);
  const motionClipId=useAtlasMotion(s=>s.clip);
  const [data, setData] = useState<Assembly | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("P02"),
    [view, setView] = useState<AtlasView>("hero");
  const [viewRevision, setViewRevision] = useState(0);
  const [layers, setLayers] = useState<AtlasLayers>({
    human: true,
    shell: true,
    utilities: true,
    hardware: true,
    xray: false,
    electronics: true,
  });
  const [hmiMode, setHmiMode] = useState<HmiMode>("standby");
  const [screenPower, setScreenPower] = useState(true);
  const [studioLight, setStudioLight] = useState(false);
  const [humanOnly, setHumanOnly] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]),
    [isolated, setIsolated] = useState<string | null>(null),
    [explode, setExplode] = useState(0),
    [section, setSection] = useState(false),
    [measure, setMeasure] = useState(false),
    [search, setSearch] = useState(""),
    [presentation, setPresentation] = useState(false),
    [meshCount, setMeshCount] = useState(0);
  const [activePart, setActivePart] = useState<string | null>(null),
    modelRef = useRef<THREE.Group | null>(null);
  useEffect(()=>{
    const demo=new URLSearchParams(window.location.search).get('demo');
    if(demo==='intro'||demo==='carry'||demo==='harvest')useAtlasMotion.getState().chooseSequence(demo);
    const clip=MOTION_CLIPS.find(c=>c.id===demo);
    if(clip){
      useAtlasMotion.getState().setEnabled(true);useAtlasMotion.getState().choose(clip.id);
      const human=['walk','run','squat','singleLeg','wave'].includes(clip.id);
      setView(clip.id==='wave'?'front':human?'side':'hero');setHumanOnly(human);
    }
  },[]);
  useEffect(()=>{
    if(motionEnabled&&(sequence!=='basic'||motionClipId==='dexterity'||motionClipId==='grasp')){
      setHumanOnly(false);setIsolated(null);setHidden([]);
    }
  },[motionEnabled,sequence,motionClipId]);
  useEffect(() => {
    fetch("/assets/v04/assembly.json")
      .then((r) => {
        if (!r.ok) throw Error("工程清单载入失败");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("工程清单载入失败"));
  }, []);
  const ready = useCallback((count: number) => setMeshCount(count), []);
  const info = MODULES[selected];
  const parts = useMemo(
    () => data?.parts.filter((p) => p.family === selected) ?? [],
    [data, selected],
  );
  const picked = parts.find((p) => p.id === activePart) ?? parts[0];
  const toggle = (key: keyof AtlasLayers) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  const select = (id: string) => {
    setSelected(id);
    setActivePart(null);
    if (isolated) setIsolated(id);
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = "/assets/v04/ATLAS_R04_ENGINEERING.zip";
    a.download = "ATLAS_R04_ENGINEERING.zip";
    a.click();
  };
  const screenshot = () =>
    document.querySelector("canvas")?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ATLAS-R04-${view}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  const setMotionMode=(enabled:boolean)=>{
    useAtlasMotion.getState().setEnabled(enabled);
    if(enabled&&useAtlasMotion.getState().sequence==='intro')useAtlasMotion.getState().choose(useAtlasMotion.getState().clip);
    setExplode(0);setSection(false);setMeasure(false);setIsolated(null);setHumanOnly(false);
    setView('hero');setViewRevision(r=>r+1);
  };
  return (
    <main
      className={`atlas-app r04 ${motionEnabled ? 'motion-active' : ''} ${motionEnabled&&sequence!=='basic'?'scenario-active':''} ${motionEnabled&&sequence==='intro'?'intro-active':''} ${presentation ? "presentation" : ""} ${studioLight ? "studio-light" : ""}`}
    >
      <header className="atlas-topbar">
        <a className="atlas-brand" href="/">
          <span className="atlas-logo">{tr("E")}<span>{tr("F")}</span>
          </span>
          <span>{tr("EXO FORGE")}<small>{tr("INDUSTRIAL DESIGN STUDIO")}</small>
          </span>
        </a>
        <div className="atlas-file">
          <span className="atlas-dot" />{tr("ATLAS")}<span className="slash">/</span>{tr(" R04")}{" "}
          <small>{tr("人体外骨骼 · 双机械臂")}</small>
        </div>
        <div className="atlas-top-actions">
          <LanguageSwitch/>
          <button className={`atlas-motion-toggle ${motionEnabled?'active':''}`} data-testid="motion-toggle" aria-pressed={motionEnabled} onClick={()=>setMotionMode(!motionEnabled)}><Activity size={16}/>{tr(motionEnabled?'退出动作':'动作模式')}</button>
          <button className="atlas-intro-toggle" data-testid="intro-start" aria-label={tr("演示介绍 · 50 秒")} onClick={()=>{setMotionMode(true);useAtlasMotion.getState().chooseSequence('intro');}}><Film size={16}/><span data-compact={tr("50 秒介绍")}>{tr("演示介绍 · 50 秒")}</span></button>
          <AtlasVideoLibrary/>
          <button
            title={tr("切换明暗影棚")}
            aria-pressed={studioLight}
            onClick={() => setStudioLight(!studioLight)}
          >
            <Sun size={17} />
          </button>
          <a className="legacy-link" href="?view=legacy">{tr("工况计算")}<MoveUpRight size={13} />
          </a>
          <button title={tr("保存视口图片")} onClick={screenshot}>
            <Camera size={17} />
          </button>
          <button
            className={presentation ? "active" : ""}
            onClick={() => setPresentation(!presentation)}
            title={tr("切换展示模式")}
          >
            <Maximize size={17} />
          </button>
          <button
            className="engineering-download"
            data-testid="download-engineering"
            onClick={download}
          >
            <Download size={15} />{tr("工程文件")}<span>{tr("STEP + STL")}</span>
          </button>
        </div>
      </header>
      <aside className="atlas-left">
        {motionEnabled?<AtlasMotionWorkbench/>:<>
        <div className="atlas-panel-heading">
          <span>{tr("装配导航")}</span>
          <small>{tr("ASSEMBLY")}</small>
        </div>
        <label className="atlas-search">
          <Search size={14} />
          <input
            aria-label={tr("搜索零件")}
            placeholder={tr("搜索模块或零件")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="atlas-root">
          <Box size={16} />
          <b>{tr("ATLAS / R04")}</b>
          <span>{tr(data?.parts.length ?? "—")}{tr(" 种零件")}</span>
        </div>
        <div className="atlas-tree">
          {GROUPS.map(([prefix, label]) => (
            <section key={prefix}>
              <h3>
                <ChevronDown size={12} />
                {tr(label)}
                <span>
                  {
                    Object.keys(MODULES).filter((k) => k.startsWith(prefix))
                      .length
                  }
                </span>
              </h3>
              {Object.entries(MODULES)
                .filter(
                  ([id, item]) =>
                    id.startsWith(prefix) &&
                    `${id} ${item.name} ${tr(item.name)}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map(([id, item]) => (
                  <div
                    className={`atlas-tree-row ${selected === id ? "selected" : ""} ${hidden.includes(id) ? "hidden" : ""}`}
                    key={id}
                  >
                    <button
                      onClick={() => select(id)}
                      data-testid={`atlas-module-${id}`}
                    >
                      <span>{tr(id)}</span>
                      <b>{tr(item.name)}</b>
                    </button>
                    <button
                      aria-label={tr(hidden.includes(id) ? "显示 {0}" : "隐藏 {0}", [id])}
                      onClick={() =>
                        setHidden((h) =>
                          h.includes(id)
                            ? h.filter((v) => v !== id)
                            : [...h, id],
                        )
                      }
                    >
                      {hidden.includes(id) ? (
                        <EyeOff size={13} />
                      ) : (
                        <Eye size={13} />
                      )}
                    </button>
                  </div>
                ))}
            </section>
          ))}
        </div>
        </>}
        <details className="atlas-layer-controls" open={!motionEnabled}>
          <summary>{tr("显示图层")}</summary>
          <div className="atlas-layer-options">
          <label>
            <input
              type="checkbox"
              checked={layers.human}
              onChange={() => toggle("human")}
            />
            <UserRound size={14} />{tr("解剖比例人模")}<small>{tr("1750 mm")}</small>
          </label>
          <label>
            <input
              type="checkbox"
              checked={layers.shell}
              onChange={() => toggle("shell")}
            />
            <Layers3 size={14} />{tr("外部曲面护壳")}</label>
          <label>
            <input
              type="checkbox"
              checked={layers.utilities}
              onChange={() => toggle("utilities")}
            />
            <SlidersHorizontal size={14} />{tr("线束与服务接口")}</label>
          <label>
            <input
              type="checkbox"
              checked={layers.electronics}
              onChange={() => toggle("electronics")}
            />
            <Monitor size={14} />{tr("电子终端")}</label>
          <button
            className={`atlas-fit-check ${humanOnly ? "active" : ""}`}
            data-testid="human-fit-check"
            onClick={() => {
              setHumanOnly(!humanOnly);
              setIsolated(null);
              setLayers((l) => ({ ...l, human: true, xray: false }));
              setView(humanOnly ? "hero" : "fit");
              setViewRevision((r) => r + 1);
            }}
          >
            <UserRound size={14} />
            {tr(humanOnly ? "恢复穿戴总装" : "仅人模 · 检查臀腿轮廓")}
          </button>
          </div>
        </details>
      </aside>
      <section className="atlas-viewport">
        <div className="atlas-viewbar">
          <div className="atlas-model-title">
            <span>{tr("ATLAS")}</span>
            <small>{tr("HUMAN AUGMENTATION SYSTEM / 04")}</small>
          </div>
          <div className="atlas-view-buttons">
            {VIEWS.map(([key, label]) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                onClick={() => {
                  if(motionEnabled&&sequence!=='basic')useAtlasMotion.getState().setAutoCamera(false);
                  setView(key);
                  setViewRevision((revision) => revision + 1);
                  if (key === "foot") select("L06");
                  if (key === "hmi") select("P02");
                }}
                data-testid={`view-${key}`}
              >
                {tr(label)}
              </button>
            ))}
          </div>
        </div>
        <div className="atlas-canvas">
          {error ? (
            <div className="atlas-error">{tr(error)}</div>
          ) : (
            <AtlasScene
              selected={selected}
              onSelect={select}
              hidden={hidden}
              isolated={isolated}
              layers={layers}
              explode={explode}
              section={section}
              measure={measure}
              view={view}
              viewRevision={viewRevision}
              hmiMode={hmiMode}
              screenPower={screenPower}
              studioLight={studioLight}
              humanOnly={humanOnly}
              modelRef={modelRef}
              onReady={ready}
            />
          )}
        </div>
        <AtlasScenarioOverlay/>
        <div className="atlas-view-tools">
          <button
            title={tr("完整总装")}
            className={layers.shell && !explode ? "active" : ""}
            onClick={() => {
              setLayers((l) => ({ ...l, shell: true }));
              setExplode(0);
              setIsolated(null);
              setHumanOnly(false);
            }}
          >
            <Box size={17} />
            <span>{tr("总装")}</span>
          </button>
          <button
            title={tr("查看内部骨架")}
            data-testid="atlas-skeleton"
            className={!layers.shell ? "active" : ""}
            onClick={() => toggle("shell")}
          >
            <Layers3 size={17} />
            <span>{tr("骨架")}</span>
          </button>
          <button
            title={tr("分解总装")}
            data-testid="atlas-explode"
            className={explode ? "active" : ""}
            disabled={motionEnabled}
            onClick={() => setExplode(explode ? 0 : 1)}
          >
            <Rotate3D size={17} />
            <span>{tr("爆炸")}</span>
          </button>
          <i />
          <button
            title={tr("人体透明")}
            className={layers.xray ? "active" : ""}
            onClick={() => toggle("xray")}
          >
            <UserRound size={17} />
          </button>
          <button
            title={tr("尺寸测量")}
            disabled={motionEnabled}
            className={measure ? "active" : ""}
            onClick={() => setMeasure(!measure)}
          >
            <Ruler size={17} />
          </button>
          <button
            title={tr("中面剖切")}
            disabled={motionEnabled}
            className={section ? "active" : ""}
            onClick={() => setSection(!section)}
          >
            <ScanLine size={17} />
          </button>
          <button
            title={tr("隔离当前模块")}
            className={isolated ? "active" : ""}
            onClick={() => setIsolated(isolated ? null : selected)}
          >
            <Focus size={17} />
          </button>
        </div>
        {isolated && (
          <button className="atlas-isolated" onClick={() => setIsolated(null)}>
            {tr("{0} 模块隔离中", [isolated])} <X size={13} />
          </button>
        )}
        {motionEnabled&&<AtlasMotionPanel onClose={()=>setMotionMode(false)}/>}
        <div className="atlas-view-caption">
          <span className="caption-line" />
          <div>
            <b>
              {tr(view === "foot" ? "FOOT-CONFORMAL SUPPORT" : "HUMAN × MACHINE")}
            </b>
            <p>
              {tr(view === "foot"
                ? "随鞋跟支撑 / 分段前掌 / 横向铰接"
                : "人体适配总装 · 曲面护壳与内部承力分层")}
            </p>
          </div>
          <span className="atlas-rev">{tr("DESIGN REVIEW")}<br />
            <b>{tr("R04 / 2026")}</b>
          </span>
        </div>
      </section>
      <aside className="atlas-right">
        {motionEnabled&&(sequence==='basic'?(motionClipId==='walk'||motionClipId==='run'?<AtlasGaitInspector onHuman={()=>{setHumanOnly(true);setIsolated(null);setView('side');setViewRevision(r=>r+1);}} onAssembly={()=>{setHumanOnly(false);setIsolated(null);setHidden([]);setView('hero');setViewRevision(r=>r+1);}}/>:<AtlasArmInspector onFocus={()=>{setView('hands');setViewRevision(r=>r+1);}}/>):<AtlasScenarioInspector/>)}
        <div className="atlas-panel-heading">
          <span>{tr("设计检查")}</span>
          <PanelRightClose size={16} />
        </div>
        <div className="atlas-hmi-control">
          <div>
            <Monitor size={15} />
            <span>{tr("设备屏幕预览")}</span>
            <button
              title={tr("屏幕模拟电源")}
              aria-pressed={screenPower}
              onClick={() => setScreenPower(!screenPower)}
            >
              <Power size={15} />
            </button>
          </div>
          <div className="atlas-hmi-modes">
            {(
              [
                ["standby", "待机"],
                ["assist", "辅助"],
                ["service", "维护"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                data-testid={`hmi-${id}`}
                aria-pressed={hmiMode === id}
                className={hmiMode === id ? "active" : ""}
                onClick={() => {
                  setHmiMode(id);
                  setScreenPower(true);
                }}
              >
                {tr(label)}
              </button>
            ))}
          </div>
          <small>{tr("SIMULATION · 未连接真实硬件")}</small>
        </div>
        <div className="atlas-selection">
          <div>
            <span>{tr(selected)}</span>
            <small>
              {parts.length}{tr(" 种零件 ·")}{" "}
              {parts.reduce((a, p) => a + p.quantity, 0)}{tr("实例")}</small>
          </div>
          <h2>{tr(info.name)}</h2>
          <p>{tr(info.detail)}</p>
        </div>
        <div className="atlas-inspector-block">
          <h3>{tr("接口与基准")}<small>{tr("INTERFACES")}</small>
          </h3>
          <div className="atlas-dimension-card">
            <Ruler size={15} />
            <b>{tr(info.dimensions)}</b>
          </div>
          <p className="atlas-interface">{tr(info.interface)}</p>
          <button
            className="atlas-inspect-focus"
            onClick={() => {
              if (selected === "L05" || selected === "L06") setView("foot");
              else if (selected === "P02") setView("hmi");
              else setIsolated(isolated ? null : selected);
            }}
          >
            <Focus size={14} />{tr("检查此模块")}<ChevronRight size={14} />
          </button>
        </div>
        <div className="atlas-inspector-block">
          <h3>{tr("零件明细")}<small>{tr("PARTS / BOM")}</small>
          </h3>
          <div className="atlas-parts">
            {parts.map((p) => (
              <button
                className={picked?.id === p.id ? "selected" : ""}
                key={p.id}
                onClick={() => setActivePart(p.id)}
              >
                <span className={`material-dot ${p.material}`} />
                <span>
                  <b>{tr(p.name)}</b>
                  <small>{tr(p.process)}</small>
                </span>
                <em>×{p.quantity}</em>
              </button>
            ))}
          </div>
        </div>
        {picked && (
          <div className="atlas-inspector-block atlas-part-facts">
            <h3>{tr("当前零件")}<small>{tr(picked.layer.toUpperCase())}</small>
            </h3>
            <code>{tr(picked.id)}</code>
            <dl>
              <div>
                <dt>{tr("包围尺寸")}</dt>
                <dd>
                  {tr(picked.boundsMm.map((v) => Math.round(v)).join(" × "))}{tr("mm")}</dd>
              </div>
              <div>
                <dt>{tr("实体几何")}</dt>
                <dd>
                  <Check size={12} />
                  {tr(picked.validBRep ? "有效 B-Rep" : "待检查")}
                </dd>
              </div>
              <div>
                <dt>{tr("STL 封闭性")}</dt>
                <dd>
                  <Check size={12} />
                  {tr(picked.watertight ? "水密" : "待检查")}
                </dd>
              </div>
            </dl>
            {DRAWING_PARTS.has(picked.id) && (
              <div className="atlas-part-drawing">
                <a
                  href={`/assets/v04/drawings/${picked.id}.svg`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={`/assets/v04/drawings/${picked.id}.svg`}
                    alt={tr("{0} 正投影轮廓", [picked.name])}
                  />
                </a>
                <a download href={`/assets/v04/drawings/${picked.id}.dxf`}>{tr("中面轮廓 / DXF")}<Download size={12} />
                </a>
              </div>
            )}
            <a download href={`/assets/v04/step/${picked.id}.step`}>
              <Download size={14} />{tr("下载此零件 STEP")}</a>
          </div>
        )}
        <div className="atlas-review-note">
          <span>{tr("开发输入 · 非生产放行")}</span>
          <p>{tr("可交给工程师审查总装和继续设计。实体封闭不代表装配成立：生产接口、公差、全姿态干涉和结构强度尚未验证。")}</p>
        </div>
      </aside>
      <footer className="atlas-bottom">
        <span>
          <i />{tr("EXO Forge · 开源设计项目")}</span>
        <span>{tr(data?.instances.length ?? "—")}{tr(" 装配实例")}</span>
        <span>{tr(meshCount || "—")}{tr(" 显示网格")}</span>
        <div />
        <span>{tr("单位 mm · 1:1 设计")}</span>
        <span className="atlas-foot-path">{tr("机械臂 → 背框 → 髋膝踝 → 随鞋足板 → 地面")}</span>
        <small>{tr("R04")}</small>
      </footer>
    </main>
  );
}
