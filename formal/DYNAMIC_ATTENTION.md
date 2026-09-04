# 隐藏需求下的动态可能性配置：形式化模型与 Lean 结论

## 0. 结论先行

第二个问题可以被严格闭合为一个有限时域、熵正则的 belief-state
动态规划问题。严格成立的核心结论是：

1. 给定下一期价值函数，每个状态下的 Bellman 配置分布存在且唯一；
2. 没有额外可行域约束时，唯一配置分布是参考分布对 soft
   \(Q\) 函数的 Gibbs 指数倾斜；
3. 逐期后向递推后，价值函数序列和“在每个状态都 Bellman
   最优”的状态反馈选择器联合唯一；
4. 固定 Matcher 分数时，KL 正则的元路由也有唯一解；
5. 这些结论不推出整个动态市场的唯一均衡、公平、反垄断、
   平台中立、去中心化或学习收敛。

前三项的抽象约束版和一般可测配置空间的无约束 Gibbs 版均已通过
Lean；Matcher 路由与复制方程的条件性推导也已通过 Lean。

## 1. 动态问题的基本对象

固定有限时域 \(t=0,\ldots,T-1\)。令：

- \(\theta_t\in\Theta\) 为隐藏需求状态；
- \(H_t\) 为截至 \(t\) 的可观测历史；
- \(b_t=\Pr(\theta_t\in\cdot\mid H_t)\) 为后验信念；
- \(s_t\) 为候选集、预算、产权、责任和公共规则等可观测状态；
- \(z_t=(b_t,s_t)\in Z_t\) 为充分信息状态；
- \(\omega_t\in\Omega_t(z_t)\) 为一个合法的完整配置；
- \(P_{0,t}(\cdot\mid z_t)\) 为参考配置分布；
- \(P_t(\cdot\mid z_t)\) 为协议当前选择的随机配置；
- \(\mathcal C_t(z_t)\) 为允许的随机配置集合。

隐藏状态转移核和反馈核可分别写成

\[
\theta_{t+1}\sim\mathcal T_t(\cdot\mid\theta_t,\omega_t),
\qquad
y_t\sim\mathcal O_t(\cdot\mid\theta_t,\omega_t).
\]

将转移、观测和 Bayes 更新合成后，得到信念状态转移核

\[
K_t(dz'\mid z,\omega).
\]

这个合成很重要：Bellman 方程只需要 \(K_t\)，不需要在优化定理中
重复展开 Bayes 公式。Lean 文件中的 **State** 就是 \(z\)，
**continuation** 则抽象表示对 \(K_t\) 的下一期价值积分。

## 2. 闭合后的 Bellman 问题

当前信念下的期望即时福利定义为

\[
\bar r_t(z,\omega)
=
\mathbb E_{\theta\sim b}
[r_t(\theta,\omega,s)].
\]

对任意下一期价值函数 \(V\)，定义

\[
G_t^V(z,\omega)
=
\int V(z')K_t(dz'\mid z,\omega)
\]

和 soft \(Q\) 分数

\[
Q_t^V(z,\omega)
=
\bar r_t(z,\omega)+\delta G_t^V(z,\omega).
\]

终值为 \(V_T=h\)。动态问题是

\[
\boxed{
V_t(z)=
\max_{P\in\mathcal C_t(z)}
\left\{
\int Q_t^{V_{t+1}}(z,\omega)\,P(d\omega)
-
\rho D_{\mathrm{KL}}
\bigl(P\|P_{0,t}(\cdot\mid z)\bigr)
\right\}.}
\tag{DA}
\]

这里优化变量是“配置的概率分布”，不是单个被抽中的配置。

## 3. 足以得到存在唯一性的条件

### 3.1 最简单且完整的有限模型

以下条件足以闭合原问题：

1. \(T<\infty\)；
2. 隐状态、观测和每期合法配置集合有限；
3. 转移核、观测核及其时序定义已知；
4. 即时收益和终值为有限实数；
5. \(\mathcal C_t(z)\) 非空、闭且凸；
6. \(P_{0,t}(\omega\mid z)>0\) 对所有合法配置成立；
7. \(\rho>0\)；
8. 通常取 \(\delta\in[0,1]\)。

有限维概率单纯形是紧集，所以“闭”给出紧性。有限时域中的存在
唯一性不要求 \(\delta<1\)；但若改成无限时域并希望用压缩映射得到
唯一不动点，则通常还需有界收益和 \(\delta<1\)。

### 3.2 一般配置空间

对无约束 Gibbs 步，可把 \(\Omega\) 取成任意可测空间。除
\(\rho>0\) 和参考概率测度外，需要

\[
\int e^{Q/\rho}\,dP_0<\infty,
\qquad
\int e^{Q/\rho}|Q/\rho|\,dP_0<\infty.
\]

紧空间上的连续 \(Q\) 是熟悉的充分条件，但连续性本身在非紧空间
上不足以保证指数可积。

对有额外约束的版本，最直接的抽象条件是：

- 可行域非空、紧；
- Bellman 目标在可行域上上半连续；
- Bellman 目标在可行域上严格凹。

严格凹性同时蕴含所需的凸域条件。在线性福利减
\(\rho KL\) 的模型中，\(\rho>0\) 和 KL 的严格凸性正是唯一性的
来源；连续性和紧性主要负责最优值能否取得。

## 4. 无约束 Bellman 步的严格推导

固定 \(t,z,V_{t+1}\)，简写

\[
Q(\omega)=Q_t^{V_{t+1}}(z,\omega),
\qquad
P_0=P_{0,t}(\cdot\mid z).
\]

令

\[
Z=\int e^{Q/\rho}\,dP_0,
\qquad
\frac{dP^*}{dP_0}(\omega)
=
\frac{e^{Q(\omega)/\rho}}{Z}.
\]

对所有目标有限的 \(P\ll P_0\)，KL 换基恒等式给出

\[
\begin{aligned}
\int Q\,dP-\rho KL(P\|P_0)
&=
\rho\log Z-\rho KL(P\|P^*)\\
&\le \rho\log Z.
\end{aligned}
\]

等号成立当且仅当 \(KL(P\|P^*)=0\)，也即 \(P=P^*\)。因此

\[
\boxed{
\frac{dP_t^*}{dP_{0,t}}(\omega\mid z)
=
\frac{\exp(Q_t^{V_{t+1}}(z,\omega)/\rho)}
{\int\exp(Q_t^{V_{t+1}}(z,u)/\rho)P_{0,t}(du\mid z)}
}
\]

是唯一解，且

\[
V_t(z)
=
\rho\log
\int e^{Q_t^{V_{t+1}}(z,\omega)/\rho}
P_{0,t}(d\omega\mid z).
\]

从终值开始后向归纳，每一步的价值和选择器都被唯一确定。

## 5. 有约束时能得到什么

若 \(\mathcal C_t(z)\) 是非空紧凸集，并且目标上半连续、严格凹，
则每一步仍有唯一最优分布。此结论不要求解具有简单的无约束
Gibbs 公式。

若约束由有限个线性矩不等式或等式给出，并且满足 Slater 条件或
相应约束资格条件，KKT 才能进一步给出

\[
\frac{dP_t^*}{dP_{0,t}}
\propto
\exp\left(
\frac{Q_t-\nu_t^\top c_t+\zeta_t^\top h_t}{\rho}
\right).
\]

最优分布唯一并不自动意味着 KKT 乘子唯一。

## 6. “动态唯一”必须如何表述

Lean 验证的是以下精确陈述：

> 在每个状态都满足 Bellman 最优条件的状态反馈选择器，以及与它
> 同时满足递推方程的价值函数序列，是逐状态唯一的。

如果只要求从一个给定初始状态取得最大期望收益，那么不可达历史上
如何行动不影响目标值，因此任意历史策略在字面上未必唯一。

在一般 Borel 状态空间上，逐状态唯一选择还不自动给出可测策略；
若需要一个可测 Markov kernel，还要增加联合可测性、可行对应的
可测性和相应的可测最大值定理。有限状态模型没有这个额外困难。

## 7. Matcher 的准确位置与元路由

Matcher 是预测或求解主体，不是第二问的基本资源，也不是需求未知
问题的必要组成。固定一组 Matcher 后，可以另加一个路由子问题。

令 Matcher 集合为有限集 \(J\)，参考份额
\(\alpha_0\in\Delta_J\) 满足 \(\alpha_{0,j}>0\)，固定可比净分数

\[
W_j=\bar V_j-\nu^\top c_j.
\]

无约束路由为

\[
\max_{\alpha\in\Delta_J}
\left\{
\sum_j\alpha_jW_j
-
\tau_M KL(\alpha\|\alpha_0)
\right\},
\qquad \tau_M>0.
\tag{MR}
\]

它有唯一解

\[
\boxed{
\alpha_j^*
=
\frac{\alpha_{0,j}e^{W_j/\tau_M}}
{\sum_k\alpha_{0,k}e^{W_k/\tau_M}}.}
\]

若加入非空紧凸的公共约束，严格凹性仍给出唯一份额；只有在满足
约束资格条件后，才可把最优乘子代入 \(W_j\) 写成 KKT Softmax。

这里的结论是“固定分数下的路由唯一”。如果 Matcher 的评分、
策略、数据分布和平台规则同时内生演化，(MR) 本身没有证明整个
市场存在唯一动态均衡。

## 8. 复制动态是额外更新规则的结果

一次静态 Softmax 不包含时间导数。额外规定

\[
\dot z_j(t)=W_j(t),
\qquad
\alpha_j(t)=
\frac{\alpha_{0,j}e^{z_j(t)/\tau_M}}
{\sum_k\alpha_{0,k}e^{z_k(t)/\tau_M}},
\]

对时间求导才得到

\[
\boxed{
\dot\alpha_j(t)
=
\frac{\alpha_j(t)}{\tau_M}
\left(
W_j(t)-\sum_k\alpha_k(t)W_k(t)
\right).}
\]

Lean 已直接验证这个导数恒等式。因此准确的逻辑方向是：

\[
\text{连续时间指数权重更新}
\Longrightarrow
\text{复制方程},
\]

而不是

\[
\text{静态 KL 路由}
\Longrightarrow
\text{复制方程}.
\]

## 9. 对原材料中几个关键命题的校正

### 9.1 继续价值不等于纯信息价值

\[
G_t^V(z,\omega)=
\mathbb E[V_{t+1}(z_{t+1})\mid z_t=z,\omega_t=\omega]
\]

是总继续价值，既可能包含物理状态变化、预算变化和真实需求变化，
也包含观测改善产生的学习价值。只有由信念更新带来的差异才可称为
信息价值。

### 9.2 互信息奖励通常只是近似

“即时收益 \(+\beta I(\theta;y)\)”一般不是 Bellman 继续价值的
恒等改写。它只有在特殊终值、对数评分或熵型价值设定下才可能精确
对应；通常应标为单步探索启发式。

### 9.3 问题一何时是问题二的特例

后验退化为点质量只消除了隐藏需求的不确定性，并不会自动消除
动作对未来物理状态、预算或收益的影响。严格退化为静态问题还需

\[
\delta=0,
\]

或 \(G_t^V(z,\omega)\) 对当前 \(\omega\) 为常数。于是继续项不改变
当前 argmax，Bellman 步才等于问题一。

### 9.4 IPS 不是严格适当评分

形如

\[
y_t\frac{P_j(\omega_t\mid H_t)}
{P_\alpha(\omega_t\mid H_t)}
\]

的量是逆倾向加权估计量。它需要已知行为倾向、支撑重叠和一致的
反事实目标；它不是严格适当评分规则。概率预测可用 log score 或
Brier score，策略价值评估则应单独使用 IPS、序列重要性采样或
双重稳健方法。

### 9.5 正温度不等于反垄断

当先验满支持、分数有限时，Softmax 的每个份额严格位于
\((0,1)\)。但不存在仅由 \(\tau_M>0\) 给出的统一上界。二元情形

\[
\alpha_1=\frac{e^{L/\tau_M}}{1+e^{L/\tau_M}}
\]

可以实现任意 \(p\in(0,1)\)：取

\[
L=\tau_M\log\frac{p}{1-p}.
\]

这一“内部份额全可实现”结论已由 Lean 验证，所以
\(\alpha_j<1\) 只是形式上的非退化，不能解释为实质反垄断。若制度
目标需要竞争，应显式加入

\[
\underline\alpha_j\le\alpha_j\le\overline\alpha_j<1
\]

或最低探索混合。

### 9.6 KL 唯一性没有推出的结论

以下命题都需要额外定义和假设，不能从 Gibbs/KL 结构单独推出：

- 公平和平台中立；
- 数据产权与支付正当性；
- Matcher 可进入性和可替换性；
- 自发形成去中心化 MoE 分工；
- 学习过程收敛；
- 整个注意力市场的存在唯一均衡。

## 10. Lean 形式化覆盖

### 动态 Bellman 文件

**Formal/DynamicAttention.lean** 验证了：

- **Model.existsUnique_bellmanAction**：非空紧可行域、上半连续和
  严格凹推出每步存在唯一最优动作；
- **Model.bellmanSolution_unique**：抽象有限时域 Bellman 价值与
  逐状态选择器联合唯一；
- **GibbsModel.existsUnique_stageOptimal**：一般可测配置空间上，
  每个无约束 KL Bellman 步存在唯一最优概率测度；
- **GibbsModel.stageOptimal_measure_eq_tilted**：最优测度等于参考
  测度的指数倾斜；
- **GibbsModel.value_succ_eq_logPartition**：Bellman 值等于
  \(\rho\log Z\)；
- **GibbsModel.bellmanSolution_unique**：Gibbs Bellman 递推的价值
  与逐状态概率策略联合唯一。

### Matcher 文件

**Formal/MatcherRouting.lean** 验证了：

- **existsUnique_finite_matcher_routing**：有限 Matcher、满支持参考
  份额和正温度下路由唯一；
- **finite_matcher_routing_eq_tilted_iff**：取得最优值当且仅当路由
  是参考份额的指数倾斜；
- **softmax_pos**、**sum_softmax_eq_one**、**softmax_lt_one**：
  Softmax 份额的基本性质；
- **binaryLeaderShare_surjective_interior**：正温度不能提供统一的
  反集中上界；
- **replicator_identity**：在连续时间指数权重更新假设下，份额
  导数满足复制方程。

上述 theorem 均无 **sorry**。公理扫描只报告 Mathlib 常见的
**propext**、**Classical.choice**、**Quot.sound**，源文件扫描无
可疑项。

### 尚未声称已经验证的层

本次没有把以下工程和制度层伪装成已经形式化的定理：

- 从 \(\mathcal T,\mathcal O\) 展开并证明 Bayes filter 的所有
  可测性和归一化性质；
- 一般 Borel 状态空间上的可测策略选择；
- 约束 Gibbs 公式的无限维 KKT 乘子存在性；
- IPS 或双重稳健估计的一致性和方差界；
- 公平、治理、反垄断或市场均衡定理。

## 11. 最终判断

问题二存在一个扎实、可验证的数学内核，但结论必须分层：

\[
\boxed{
\begin{array}{c}
\text{有限时域 belief-state 动态控制}\\
+\ \rho>0\text{ 的 KL 正则}\\
+\ \text{适当紧性、连续性或指数可积性}
\end{array}
\Longrightarrow
\begin{array}{c}
\text{每个 Bellman 步的唯一配置分布}\\
\text{以及后向递推的逐状态唯一 Gibbs 策略}
\end{array}}
\]

固定 Matcher 分数后，完全相同的变分结构给出唯一元路由。但它只
解决“如何在参考分布附近按价值分数选择概率分布”，并不自动解决
制度公平、平台权力、反垄断或内生市场均衡。第二问最可靠的理论
定位因此是：

> 动态配置唯一性定理已经成立；宏观注意力市场的公平与治理结论
> 仍需作为独立机制层继续建模。
