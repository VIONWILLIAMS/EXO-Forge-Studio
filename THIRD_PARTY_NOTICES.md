# Third-party notices / 第三方来源与授权

Project-authored code, documentation, design files and media are offered under the root [MIT license](LICENSE). The following third-party materials keep their original licenses; the root license does not replace them. Runtime dependencies are installed from `package-lock.json` and retain their respective licenses.

项目自行编写的代码、文档、设计文件和媒体采用根目录 MIT 许可；下列第三方内容保留其原始许可。软件许可不构成工程、医疗或设备安全认证。

## Anatomical base mesh / 人体基网格 — CC0 1.0

- Asset: MakeHuman hm08, `assets/vendor/makehuman/base.obj`.
- Creator: MakeHuman project contributors; the source header credits Data Collection AB and the MakeHuman Team.
- [Upstream mesh](https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj), [upstream license explanation](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- Preserved notices: [source record](assets/vendor/makehuman/SOURCE.md), [upstream license](assets/vendor/makehuman/LICENSE.md), [asset license text](assets/vendor/makehuman/LICENSE.ASSETS.md).
- Project modifications: posing, protected hip geometry, workwear/material regions, boot surfaces, skin weights and hand articulation. These derivatives appear in R03/R04 `.blend` and `.glb` assets and the project recordings.
- Only the graphical asset is vendored. The MakeHuman application source is not included; its separate AGPL license is not the license of this CC0 mesh.

人体基网格来自 MakeHuman。项目在其上进行姿态、服装材质、权重及手部绑定适配，并在视频中展示这些模型。

## Gait datasets and derived curves / 步态数据与派生曲线 — CC BY 4.0

1. Fukuchi CA, Fukuchi RK, Duarte M (2018). *A public dataset of overground and treadmill walking kinematics and kinetics in healthy individuals*. [PeerJ 6:e4640](https://doi.org/10.7717/peerj.4640). [Dataset](https://doi.org/10.6084/m9.figshare.5722711).
2. Fukuchi RK, Fukuchi CA, Duarte M (2017). *A comprehensive public data set of running biomechanics and the effects of running speed on lower extremity kinematics and kinetics*. [PeerJ 5:e3298](https://doi.org/10.7717/peerj.3298). [Dataset](https://doi.org/10.6084/m9.figshare.4543435).

Both datasets are distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see the [license text](assets/reference/gait/LICENSE-CC-BY-4.0.txt). This applies to the retained data under `assets/reference/gait/` and derived curves in `src/domain/data/gaitReference.json`. Preserve the attribution and license link, and identify further changes when redistributing those materials, their plots or recordings that display them.

Project changes: participant filtering, left/right averaging, group means and standard deviations, periodic interpolation, chart rendering and adaptation to the existing rig. Motion timings, upper-body motion and task choreography are project adaptations, not additional measurements from the studies. Raw data files are unmodified. Per-file download URLs and SHA256 are in [provenance.json](assets/reference/gait/provenance.json); selection and processing details are in the [dataset README](assets/reference/gait/README.md).

两组数据和派生曲线保留 CC BY 4.0 署名要求。平均曲线与演示适配不代表临床标准、个体诊断或可用于硬件的控制参数。传播相关图表或含图表的视频时请一并保留本说明。

## Gait phase reference / 步态分期参考

Kim IJ, Gallagher MJ, Speckman RA, [Biomechanics of Normal Gait — AAPM&R PM&R KnowledgeNow](https://now.aapmr.org/biomechanics-normal-gait/). The application links to this source and uses it as a phase reference. Its copyrighted clinical illustrations and PDF are not redistributed; figures in the app are project-rendered schematics and plots.

## Software / 软件依赖

React, Three.js, React Three Fiber, Drei, Zustand, Lucide and the build/test tools are installed by npm. Their licenses are recorded in their packages and the lockfile. CadQuery, OpenCascade, Blender and FFmpeg are optional external authoring tools; their application code is not bundled here. Using this project does not grant rights to third-party names or imply endorsement by any source or tool author.
