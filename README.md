<div align="center">

# Ball War

**小球的领土战争** — 一款纯前端的实时领土争夺游戏

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

**QQ 群**：[855571375](https://qm.qq.com/q/PdLMx9Jowq) - 用户交流、问题反馈

如果这个项目对您有帮助，请给我一个 ⭐️ Star！

</div>

## 分区

- **计数区**（左栏）：弹珠塔——两枚投球孔不断投球，小球在钉阵里弹跳，撞到倍率钉就按钉上的倍数翻倍，落进类型槽后为同色基地炮交付弹药。
- **领地区**（中栏）：1024×1024 像素的涂色战场——四色势力的基地炮自动出膛，弹药涂到哪格、哪格就归谁，护盾见底的一家出局。
- **信息区**（右栏）：战况排行、势力分布、战场数据、模拟参数四段读数；底行是时间与帧率，以及重开、切换明暗两枚按钮。

## 参数

信息区的「模拟参数」段有六个滑块，拖动立刻生效：

- **每投初值**：1–64（默认 3）——新投出的小球携带的初始数值。
- **撞钉扰动**：0–45°（默认 ±10°）——每撞上一枚钉后速度方向的随机偏转上限。
- **倍率钉数**：5–97（默认 33）——钉阵里带倍率的钉的数量。
- **每色球数**：1–8（默认 2）——每种颜色在塔内的球数。
- **单值像素**：1–64（默认 4）——1 点数值能改写多少像素。
- **初始数值**：0–1024K（默认 10K）——开局摊给每家的库存数值。

## 逻辑

- **计数区**：一投从「每投初值」起算；撞到哪枚倍率钉就乘哪枚的倍数，同一枚一趟只结一次；落进类型槽碰到触发面即整批交付给同色基地炮，球回投球孔重投。
- **领地区**：库存按弹种自动出膛；弹药涂改归属，撞上对手护盾会削减它；护盾见底的一家出局，最后一个存活者统一战场。
- 对局全程自动运行，没有键盘快捷键；模拟按定步长推进，帧率波动不影响对局。
