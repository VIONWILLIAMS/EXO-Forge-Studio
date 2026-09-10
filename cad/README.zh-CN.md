# EXO Forge CAD V0.2

这一目录把项目从“渲染网格”切换到“参数化实体”。源文件使用 CadQuery/OpenCascade 构建 B-Rep 实体，并输出可继续编辑的 STEP 与可切片的 STL。

## 这一版能做什么

- 以毫米为单位保留 1750 mm 人形外骨骼的名义尺寸。
- 默认生成 1:5 可动装配验证件，所有单件适配 220×220×250 mm 打印空间。
- 20 个模块族分别输出 STEP/STL；左右件保持独立命名。
- M3/3 mm 销轴体系：孔径 3.4 mm，名义活动间隙 0.25 mm。
- 自动检查 B-Rep 有效性、STL 封闭性、正体积、打印床包络和模块覆盖。
- 输出总装 STEP、打印 BOM、验证报告和 CAD 派生预览模型。

## 构建

```bash
uv venv .venv-cad --python 3.11
uv pip install --python .venv-cad/bin/python cadquery==2.6.1 trimesh==4.11.4 networkx==3.6.1 lxml==6.0.2
.venv-cad/bin/python cad/build_cad.py
```

输出位于 `cad/output/`：

- `step/`：每个零件的 B-Rep STEP。
- `stl/`：每个零件的水密 STL。
- `EXO_FORGE_CAD_V02_ASSEMBLY.step`：带独立零件的总装。
- `EXO_FORGE_CAD_V02_PREVIEW.glb`：供网页或通用三维查看器使用。
- `3mf/`：四张已经排版的 220×220 mm 打印板。
- `EXO_FORGE_CAD_V02_PRINT_PACK.zip`：可直接交给切片环节的整包文件。
- `bom.json`：数量、模块族、材料建议和紧固件。
- `validation.json`：实体与打印约束验收。

## 打印建议

- 首轮用 PLA/PETG、0.2 mm 层高、3–4 壁、15–25% 填充验证装配。
- 先打印 `FIT_TEST_PIN` 公差试片，确认本机 3.4 mm 孔对 3 mm 销轴是否顺畅。
- 关节使用 M3 螺钉、垫片与尼龙锁紧螺母，不建议把塑料打印销当作长期转轴。
- 这套文件用于几何、装配和运动关系验证，不用于真人穿戴或 50 kg 承载。

## 为什么不能直接打印上一版 GLB

上一版 GLB 是为实时显示合批的三角网格。检测结果为 Hero 114 个网格、LOD 77 个网格，但两者都没有可确认的水密实体。CAD V0.2 重新从封闭实体生成网格，而不是修补渲染模型。
