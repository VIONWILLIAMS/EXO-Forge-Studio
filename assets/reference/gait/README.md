# 人体步态参考数据 / M5

这些文件用于改进网页姿态演示，不是临床标准值、医疗建议或设备控制参数。

## 来源及使用条件

1. Fukuchi CA, Fukuchi RK, Duarte M (2018). *A public dataset of overground and treadmill walking kinematics and kinetics in healthy individuals*. [PeerJ 6:e4640](https://doi.org/10.7717/peerj.4640)，[作者数据集](https://doi.org/10.6084/m9.figshare.5722711)。CC BY 4.0。
2. Fukuchi RK, Fukuchi CA, Duarte M (2017). *A comprehensive public data set of running biomechanics and the effects of running speed on lower extremity kinematics and kinetics*. [PeerJ 5:e3298](https://doi.org/10.7717/peerj.3298)，[作者数据集](https://doi.org/10.6084/m9.figshare.4543435)。CC BY 4.0。
3. Kim IJ, Gallagher MJ, Speckman RA. [Biomechanics of Normal Gait — AAPM&R PM&R KnowledgeNow](https://now.aapmr.org/biomechanics-normal-gait/)，页面更新于 2025-03-20。只参考步行分期、落脚缓冲和观察方法，并提供原图链接；未复制其受版权保护的 PDF 图。

数据许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本项目修改：左右平均、组平均和标准差、周期插值、图表绘制及适配到现有模型。原始文件不作修改。

## 筛选与处理

- 步行保留 42 人 T05 的小型 `ang.txt` 文件，应用仅使用元数据中标为 Young 的 01–24 号。T05 为自选舒适速度的跑步机赤足行走。24 人平均记录速度 1.24458 m/s、平均腿长 0.87849 m。没有把老年组混入年轻组。
- 跑步使用原始 001–028 号的 `processed.txt`，仅提取后缀 25（2.5 m/s）。后续增加的参与者和更快速度不进入当前动画。
- 髋、膝、踝屈伸是源文件的 Z 轴；不是 X 轴。每条曲线为 101 点，从该侧落脚到下一次同侧落脚。左右先按各自落脚对齐，先算每人的左右平均，再算受试者间均值和样本标准差（n−1）。标准差色带不是“正常 / 异常”的医学界线。
- 步行包含全局骨盆与足部角度。跑步处理数据缺少骨盆角度，10° 的静态轴偏置、缩小的步行骨盆摆动、上肢姿态和 0.76 秒展示周期均为本项目适配，不是该跑步试验的测量结果。步行展示周期 1.10 秒同样属于播放编排。
- UI 中膝角虚线由实际三维髋到踝距离计算，并与真实 GLB 骨骼夹角核对；不是直接把参考线复制后标成“模型结果”。

## 复现

`python3 tools/import_gait_reference.py` 通过作者 Figshare API 找到资源，只读取大型 ZIP 内的小型角度文件（HTTP Range），不下载整套动捕档案。下载记录在 `provenance.json`，包含逐文件 SHA256；Figshare 元数据单独保留。

`python3 tools/build_gait_reference.py` 从已保留的原始文件生成 `src/domain/data/gaitReference.json`。计算使用 Python 标准库；元数据年龄与速度选择已经核对，生成脚本不依赖在线服务。

`npm test` 包含参考数据、关节曲线、实际骨骼、支撑相、鞋底和场景回归。测试量化的是显示轨迹和几何关系，不是地面反力、能耗、稳定性或真人验证。
