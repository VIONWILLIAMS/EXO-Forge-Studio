import type { ModuleManifestEntry } from './types'

const bilateral = (id: string, name: string, parentId: string, axis: [number, number, number], range: Record<string, [number, number]>, safetyLabels: string[] = []): ModuleManifestEntry => ({
  id, name, glbNodes: [`${id}_L`, `${id}_R`], parentId, side: 'B', connectionInterfaces: [`IF_${parentId}_${id}_L`, `IF_${parentId}_${id}_R`], localAxis: axis, parameterRange: range, safetyLabels,
})

export const MODULE_MANIFEST: ModuleManifestEntry[] = [
  { id: 'H01', name: '胸背承托接口', glbNodes: ['H01_HARNESS'], parentId: 'F02', side: 'C', connectionInterfaces: ['IF_HARNESS_SPINE'], localAxis: [0, 1, 0], parameterRange: { chestCircumferenceMm: [820, 1180] }, safetyLabels: ['BODY_CONTACT', 'QUICK_RELEASE'] },
  bilateral('H02', '腿部承托绑带', 'L02', [0, 1, 0], { strapMm: [420, 720] }, ['BODY_CONTACT', 'PINCH_GUARD']),
  bilateral('H03', '内侧操纵臂', 'F01', [0, 0, 1], { reachMm: [280, 460] }, ['LOW_FORCE_MASTER', 'E_STOP_REACH']),
  { id: 'F01', name: '肩部主承力框', glbNodes: ['F01_SHOULDER_FRAME'], parentId: null, side: 'C', connectionInterfaces: ['IF_ARM_L', 'IF_ARM_R', 'IF_SPINE'], localAxis: [1, 0, 0], parameterRange: { shoulderFrameMm: [680, 840] }, safetyLabels: ['STRUCTURAL_PATH', 'LIFT_POINT'] },
  { id: 'F02', name: '伸缩脊柱承力梁', glbNodes: ['F02_SPINE_RAIL', 'F02_SPINE_SLIDER'], parentId: 'F01', side: 'C', connectionInterfaces: ['IF_SHOULDER', 'IF_PELVIS'], localAxis: [0, 1, 0], parameterRange: { torsoLengthMm: [420, 610] }, safetyLabels: ['TELESCOPIC', 'PINCH_GUARD'] },
  { id: 'F03', name: '骨盆闭环框架', glbNodes: ['F03_PELVIS_RING'], parentId: 'F02', side: 'C', connectionInterfaces: ['IF_HIP_L', 'IF_HIP_R', 'IF_OUTRIGGER'], localAxis: [1, 0, 0], parameterRange: { pelvisRingMm: [460, 600] }, safetyLabels: ['STRUCTURAL_PATH', 'BODY_CLEARANCE'] },
  { ...bilateral('L01', '三轴髋关节', 'F03', [1, 0, 0], { offsetMm: [180, 310] }, ['ACTIVE_JOINT', 'MECHANICAL_STOP']), jointRangeDeg: [-30, 100] },
  bilateral('L02', '大腿伸缩承力段', 'L01', [0, 1, 0], { lengthMm: [360, 520] }, ['TELESCOPIC']),
  { ...bilateral('L03', '单轴膝关节', 'L02', [1, 0, 0], {}, ['ACTIVE_JOINT', 'MECHANICAL_STOP']), jointRangeDeg: [0, 120] },
  bilateral('L04', '小腿伸缩承力段', 'L03', [0, 1, 0], { lengthMm: [340, 500] }, ['TELESCOPIC']),
  { ...bilateral('L05', '双轴踝关节', 'L04', [1, 0, 0], {}, ['ACTIVE_JOINT', 'MECHANICAL_STOP']), jointRangeDeg: [-25, 25] },
  bilateral('L06', '接地脚板', 'L05', [0, 0, 1], { lengthMm: [320, 400], widthMm: [150, 210] }, ['GROUND_CONTACT', 'NON_SLIP']),
  { ...bilateral('A01', '肩部三轴动力座', 'F01', [1, 0, 0], {}, ['ACTIVE_JOINT', 'BRAKE']), jointRangeDeg: [-90, 120] },
  bilateral('A02', '上臂伸缩模组', 'A01', [0, 1, 0], { lengthMm: [380, 560] }, ['TELESCOPIC', 'CABLE_ROUTE']),
  { ...bilateral('A03', '肘部双轴关节', 'A02', [1, 0, 0], {}, ['ACTIVE_JOINT', 'BRAKE']), jointRangeDeg: [0, 145] },
  bilateral('A04', '腕部与末端快接', 'A03', [0, 0, 1], { reachMm: [800, 1150] }, ['QUICK_COUPLER', 'TOOL_LOCK']),
  { id: 'P01', name: '动力电池背包', glbNodes: ['P01_POWER_PACK'], parentId: 'F02', side: 'C', connectionInterfaces: ['IF_HV_BUS', 'IF_COOLANT'], localAxis: [0, 0, 1], parameterRange: { capacityWh: [1200, 3000] }, safetyLabels: ['HIGH_VOLTAGE', 'THERMAL'] },
  { id: 'P02', name: '控制与安全总线', glbNodes: ['P02_CONTROL_CORE'], parentId: 'P01', side: 'C', connectionInterfaces: ['IF_CAN_A', 'IF_CAN_B', 'IF_ESTOP'], localAxis: [0, 1, 0], parameterRange: {}, safetyLabels: ['SIL_CONCEPT', 'E_STOP'] },
  bilateral('P03', '可展开接地支腿', 'F03', [1, 0, 0], { outriggerSpanMm: [760, 1400] }, ['GROUND_CONTACT', 'DEPLOYMENT_ZONE']),
  { id: 'P04', name: '线束液路散热系统', glbNodes: ['P04_UTILITIES'], parentId: 'P01', side: 'C', connectionInterfaces: ['IF_COOLANT', 'IF_HARNESS'], localAxis: [0, 1, 0], parameterRange: {}, safetyLabels: ['HOT_SURFACE', 'SERVICE_LOOP'] },
]

export const manifestById = Object.fromEntries(MODULE_MANIFEST.map((entry) => [entry.id, entry]))
