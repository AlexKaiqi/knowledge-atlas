# 广义静态需求—可能性配置：正式模型与存在唯一性

## 0. 范围校正

本模型不以“三座位”为定义域。座位只是一个有限状态例子；主问题是：在任意完整可能性空间上，给定参考概率、多个需求、权利与公共约束，选择一个最优概率测度。

原材料已经提出了这个抽象方向，但仍混合了三种不同对象：

1. 最优配置测度 (P^*)；
2. Gibbs 自然参数或 KKT 乘子；
3. token 映射与价格。

下面先闭合第一种对象。后两种对象需要额外的可识别性、校准或市场出清条件，不能由配置唯一性自动推出。

## 1. 一般状态空间与需求

给定概率空间

\[
(\Omega,\mathcal F,P_0),
\]

其中：

- \(\Omega\) 是完整配置或完整结果的空间，可以有限、连续或无限维；
- \(\mathcal F\) 是可观测事件；
- \(P_0\) 是无额外需求作用时的参考概率。

模型只能以有限 KL 成本重新加权 \(P_0\) 已有的支撑。若语义上要求每个合法可能性都可到达，应在选定拓扑下假设 \(P_0\) 满支撑，或一开始就把 \(\Omega\) 收缩为合法支撑。

任何具有有限 KL 成本的候选配置都满足 \(P\ll P_0\)，因此可以写成

\[
P=qP_0,qquad q\ge0,qquad \int q\,dP_0=1.
\]

令

\[
\mathcal D=
\left\{q\in L^1(P_0):q\ge0,\ \int q\,dP_0=1\right\}.
\]

设需求数目有限，需求或 Claim 由有界可测满足函数表示：

\[
f_i\in L^\infty(P_0),\qquad i=1,\dots,n.
\]

硬 Claim \(D_i\) 是特例 \(f_i=\mathbf 1_{D_i}\)。软需求可以取 \([0,1]\) 或其他有界实值。配置 \(q\) 对需求 \(i\) 的满足度为

\[
m_i(q)=\int f_iq\,dP_0=\mathbb E_P[f_i].
\]

价值函数

\[
V_i:m_i(\mathcal D)\to\mathbb R
\]

假设有限、连续、凹。若要表达“满足越多越好”，还可加单调不减；这一条符合语义，但不是唯一性证明所必需。

## 2. 权利与公共可行域

令 \(\mathcal C\subseteq\mathcal D\) 表示所有制度约束后的可行密度。典型约束包括

\[
\int c_\ell q\,dP_0\le C_\ell,
\qquad
\int r_k q\,dP_0\ge b_k,
\qquad
\int h_jq\,dP_0=a_j,
\]

其中 \(c_\ell,r_k,h_j\in L^\infty(P_0)\)。这类矩约束产生凸且在 \(\sigma(L^1,L^\infty)\) 弱拓扑下闭的可行域。

若某项权利要求 \(P(D)=1\)，它也是闭凸约束，但会把解推到支撑边界。此时不应继续声称解在整个 \(P_0\) 支撑上具有有限参数、严格正的 Gibbs 密度；更干净的做法是先收缩合法状态空间。

## 3. 闭合后的 primal 问题

固定 KL 正则强度 \(\rho>0\)，定义

\[
H(q\mid P_0)=\int q\log q\,dP_0,
\qquad 0\log0:=0.
\]

因为 \(q=dP/dP_0\)，它正是 \(D_{\mathrm{KL}}(P\|P_0)\)。广义静态需求—可能性配置问题是

\[
\boxed{
\max_{q\in\mathcal C}
J(q)
=
\sum_{i=1}^nV_i\!\left(\int f_iq\,dP_0\right)
-\rho\int q\log q\,dP_0.
}
\tag{PA}
\]

相对熵允许取 \(+\infty\)；此时约定 \(J(q)=-\infty\)。因此目标严格说是扩展实值函数，而有限熵可行点保证问题不是完全退化的。

这里的解是唯一的概率测度 \(P^*=q^*P_0\)，不是唯一实现状态 \(\omega\)。机制最后仍可从 \(P^*\) 随机抽取不同结果。

## 4. 一般可测空间上的存在唯一性定理

### 定理 PA-EU

假设：

1. \(\mathcal C\subseteq\mathcal D\) 非空、凸，并在 \(\sigma(L^1,L^\infty)\) 下闭；
2. \(\mathcal C\) 中至少存在一个有限熵点 \(\bar q\)，即 \(H(\bar q\mid P_0)<\infty\)；
3. \(f_i\in L^\infty(P_0)\)，且需求数目有限；
4. 每个 \(V_i\) 在可达满足度区间上有限、连续且凹；
5. \(\rho>0\)。

则问题 (PA) 存在唯一最大化者 \(q^*\)，从而存在唯一配置测度

\[
P^*=q^*P_0.
\]

### 存在性推导

记

\[
U(q)=\sum_iV_i\!\left(\int f_iq\,dP_0\right).
\]

因为 \(f_i\in L^\infty\)，矩映射 \(q\mapsto\int f_iq\,dP_0\) 对 \(\sigma(L^1,L^\infty)\) 连续。每个满足度都落在一个有界闭区间中；\(V_i\) 连续且有限，所以 \(U\) 弱连续并有统一上界 \(M\)。

取最大化列 \(q_n\)。与有限熵可行点 \(\bar q\) 比较后，可令

\[
J(q_n)\ge J(\bar q)-1.
\]

于是

\[
\rho H(q_n\mid P_0)
\le M-J(\bar q)+1,
\]

即最大化列落在统一的 KL 子水平集中。由于 \(x\log x\) 超线性，de la Vallée–Poussin 判据给出 \(\{q_n\}\) 的一致可积性；Dunford–Pettis 定理给出其在 \(L^1\) 中的弱相对紧性。

取弱收敛子列 \(q_{n_k}\rightharpoonup q^*\)。可行域弱闭，所以 \(q^*\in\mathcal C\)。相对熵弱下半连续，而 \(U\) 弱连续，因此 \(J=U-\rho H\) 弱上半连续，故 \(q^*\) 取得最大值。

### 唯一性推导

函数 \(x\mapsto x\log x\) 在 \([0,\infty)\) 上严格凸，所以 \(H(\cdot\mid P_0)\) 对不同密度严格凸。另一方面，\(U\) 因 \(V_i\) 凹且矩映射线性而凹。因此 \(\rho>0\) 时

\[
J=U-\rho H
\]

严格凹。

若存在两个不同最大点 \(q_1,q_2\)，凸性保证 \((q_1+q_2)/2\in\mathcal C\)，严格凹性给出

\[
J\!\left(\frac{q_1+q_2}{2}\right)
>
\frac{J(q_1)+J(q_2)}2,
\]

与二者均为最大点矛盾。因此 \(q^*\) 唯一。

唯一性的真正来源不是连续性，而是

\[
\boxed{\mathcal C\text{ 凸}+\rho>0+\mathrm{KL}\text{ 严格凸}.}
\]

连续性、闭性与紧性或强制性主要负责“最大值能否取到”。

## 5. 固定综合需求势时的精确 Gibbs 定理

给定可测综合需求分数 \(s:\Omega\to\mathbb R\)。考虑

\[
\sup_{P\ll P_0}
\left\{\mathbb E_P[s]-\rho D_{\mathrm{KL}}(P\|P_0)\right\}.
\tag{G}
\]

假设

\[
Z_\rho=\int e^{s/\rho}\,dP_0\in(0,\infty)
\]

并满足使候选解目标有限的相应可积条件；例如 \(s\) 有界可测便自动满足。定义

\[
\frac{dP_s}{dP_0}
=\frac{e^{s/\rho}}{Z_\rho}.
\]

对任意目标有定义的 \(P\ll P_0\)，有恒等式

\[
D_{\mathrm{KL}}(P\|P_s)
=D_{\mathrm{KL}}(P\|P_0)
-\frac1\rho\mathbb E_P[s]
+\log Z_\rho.
\]

重新排列即得

\[
\mathbb E_P[s]-\rho D_{\mathrm{KL}}(P\|P_0)
=\rho\log Z_\rho-\rho D_{\mathrm{KL}}(P\|P_s)
\le\rho\log Z_\rho.
\]

KL 等于零当且仅当两个概率测度相等，因此

\[
\boxed{P_s\text{ 是 (G) 的唯一解。}}
\]

这个结论不要求 \(\Omega\) 有限，也不要求 \(s\) 连续。真正必要的是可测性与指数可积性。

一个熟悉且方便的充分条件包是：\(\Omega\) 为紧空间，\(\mathcal F\) 为 Borel σ-代数，\(P_0\) 为概率测度，\(s\) 连续。此时 \(s\) 有界，上述指数矩自动有限。

非紧空间中，“\(s\) 连续”本身不足。例如 \(P_0=N(0,1)\)、\(s(x)=x^2/2\)、\(\rho=1\) 时，\(s\) 连续但 \(Z_\rho=\infty\)，不存在归一化 Gibbs 解。

## 6. 从非线性价值与约束推出 Gibbs/KKT

若 \(V_i\) 可微，并且矩约束满足 Slater 条件或相应相对内部条件，则存在 KKT 乘子

\[
\eta_\ell\ge0,\qquad \xi_k\ge0,\qquad \zeta_j\in\mathbb R,
\]

使得

\[
s^*(\omega)
=\sum_iV_i'(m_i(q^*))f_i(\omega)
-\sum_\ell\eta_\ell c_\ell(\omega)
+\sum_k\xi_kr_k(\omega)
+\sum_j\zeta_jh_j(\omega).
\]

固定这些乘子后，Lagrangian 关于 \(P\) 的部分正是上一节的固定势问题，因此

\[
\frac{dP^*}{dP_0}
=
\frac{\exp(s^*/\rho)}{\int\exp(s^*/\rho)\,dP_0},
\]

并同时满足原始可行性、对偶可行性与互补松弛。

如果 \(V_i\) 不可微，应改用有限超梯度。若目标矩位于可达矩集边界，有限自然参数可能不存在，只能由参数趋于无穷逼近或先收缩支撑。

需要强调：唯一 primal 解 \(P^*\) 不代表 KKT 乘子唯一。乘子唯一还需要活动约束无冗余，例如 LICQ。

## 7. 自然参数什么时候唯一

设充分统计量向量为 \(T=(T_1,\dots,T_d)\)，自然参数族为

\[
\frac{dP_\theta}{dP_0}
=\exp\!\left(\theta^\top T-A(\theta)\right),
\qquad
A(\theta)=\log\int e^{\theta^\top T}\,dP_0.
\]

要使 \(\theta\mapsto P_\theta\) 单射，必须增加指数族最小性：

\[
a^\top T(\omega)=\text{常数}\quad P_0\text{-a.s.}
\Longrightarrow a=0.
\tag{Minimality}
\]

否则不同参数只是在势函数上相差常数，归一化后产生同一个概率测度。最小性下

\[
\nabla^2A(\theta)=\operatorname{Cov}_{P_\theta}(T)
\]

正定，\(A\) 严格凸，自然参数才唯一。若特征冗余，应删除冗余特征或固定 gauge。

## 8. “连续性公理”能够确定什么

若硬 Claim 的信息尺度只依赖基准概率 \(p\)，并满足

\[
u(pq)=u(p)+u(q),
\]

再加连续性和严格递减性，只能推出

\[
u(p)=-c\ln p,qquad c>0.
\]

要唯一固定单位，还需校准，例如 \(u(1/2)=1\) 才得到 \(u(p)=-\log_2p\)。

类似地，若作用权重满足

\[
v(x+y)=v(x)v(y),qquad v(0)=1,
\]

连续性和严格递增性给出

\[
v(x)=e^{\beta x},\qquad \beta>0,
\]

但仍未固定 \(\beta\)。若要唯一得到

\[
v_D(\kappa)=\exp\!\left(\frac{\kappa}{\pi u(D)}\right),
\]

还必须另加：作用只依赖无量纲变量 \(\kappa/(\pi u(D))\)，并规定单位投入的作用为 \(e\)。这是尺度校准公理，不是连续性或 KL 自动推出的结论。

## 9. 一般软需求的“尺寸”

对于一般满足函数 \(f\)，单独给出 \(f\) 并不能产生一个唯一标量 \(u(f)\)。必须同时给出目标满足水平 \(m\)。自然定义是 KL 率函数

\[
I_f(m)
=
\inf\left\{
D_{\mathrm{KL}}(P\|P_0):\mathbb E_P[f]=m
\right\}.
\]

若采用至少满足目标，则把等式换成 \(\mathbb E_P[f]\ge m\)。硬 Claim \(f=\mathbf1_D\)、目标 \(m=1\) 时才退化为

\[
I_{\mathbf1_D}(1)=-\ln P_0(D).
\]

因此原材料中的 \(u_i\) 若要推广到软需求，必须写成 \(u_i=I_{f_i}(m_i^{\rm target})\)，不能只由 Claim 名称决定。

## 10. 当前 Lean 证明覆盖

`Formal/PossibilityAllocation.lean` 已在不假设有限或离散状态空间的情况下机检：

- 抽象的“非空紧可行域 + 上半连续严格凹目标”存在唯一最大点；
- “凹 welfare − 严格凸 resistance”严格凹；
- 任意可测空间上的 Gibbs/KL 变分恒等式；
- Gibbs 上界以及等号当且仅当候选测度等于指数倾斜测度；
- 在指数矩可积条件下，指数倾斜测度是唯一 admissible 最大化者；
- 显式带 \(\rho>0\) 的目标
  \(\mathbb E_P[s]-\rho D_{\mathrm{KL}}(P\|P_0)\) 与无量纲 Gibbs 目标等价，
  并具有唯一最大化者；
- 紧状态空间与连续势函数自动满足所需可积条件。

`Formal/DemandSystem.lean` 进一步机检了广义需求层：

- 任意有限族线性满足度映射及凹价值函数的总福利仍然凹；
- 连续满足度映射与连续价值函数给出连续总福利；
- 正系数 \(\rho\) 保持 resistance 的严格凸性；
- 在非空紧可行域、上半连续目标和严格凸 resistance 下，广义需求系统有且仅有一个最优解；
- 若 welfare 连续而 resistance 只具有下半连续性，则目标已经上半连续；不需要把 KL 加强为连续；
- 若各组成部分连续，上述条件当然也自动成立。

`Formal/EntropyUniqueness.lean` 把唯一性的核心进一步落实到任意可测空间上的密度：

- 非负实密度诱导的测度，以及“总质量为一即为概率测度”；
- 密度熵等于 Mathlib 定义的 KL divergence；
- `klFun` 积分对不同的非负有限熵密度严格凸；
- 在中点封闭的可行域和中点凹 welfare 下，两个正则化最大化者必几乎处处相同，
  从而诱导同一个概率测度；
- 特别地，有限族线性满足度与凹价值函数组成的上述广义需求系统，在凸可行域中至多有一个
  最优概率密度（按几乎处处相等识别）；
- 这个唯一性步骤只需要 \(\rho>0\)，不需要连续性。

`Formal/FunctionalCalibration.lean` 则机检了连续性实际能够推出的结论：

- \(u(pq)=u(p)+u(q)\) 在 \((0,1]\) 上连续时，必有 \(u(p)=-c\log p\)；
- 若再要求严格递减，只能推出 \(c>0\)，仍未固定单位；
- 规定 \(u(1/2)=1\) 后，才唯一得到 \(-\log p/\log 2\)；
- 连续的 \(v(x+y)=v(x)v(y)\) 且 \(v(0)=1\) 必为 \(e^{\beta x}\)；
- 严格递增只推出 \(\beta>0\)，规定某个 \(s>0\) 满足 \(v(s)=e\) 后才唯一得到
  \(v(x)=e^{x/s}\)。

尚未全部编码的是：从熵子水平集的一致可积性，经 Dunford–Pettis 定理得到
\(L^1\) 弱相对紧性并取得极限，以及带约束的无限维 KKT/强对偶。因此任意可测空间上的
KL/Gibbs 唯一性和一般凸分析存在唯一性外壳已经机检；完整的 \(L^1\) 弱紧性存在性链条仍是
下一阶段。

## 11. 验证记录

本项目使用 `leanprover/lean4:v4.34.0-rc2` 与当前 Mathlib：

- 所有相关 `.lean` 文件均由语言服务器给出零诊断；
- 各文件分别通过 `lake env lean`；
- `lake build` 完整通过；
- 关键定理的公理扫描只有 Mathlib 通常使用的 `propext`、`Classical.choice`、
  `Quot.sound`，没有额外公理或占位证明。
