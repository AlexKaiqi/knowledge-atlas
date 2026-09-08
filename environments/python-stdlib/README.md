# Python 标准库环境

用于小计算、文件处理或只需要 Python 标准库的探索。无第三方依赖，不安装 Agent 或模型客户端。基础镜像固定到多平台索引摘要；该环境用 Docker 展示资产组织，简单本地计算也可直接用自己的 Python。

以下命令在仓库根目录执行，需要已有 Docker daemon。构建首次会下载基础镜像；构建标签便于使用，正式运行记录仍保存实际镜像 ID 和架构。

```sh
docker build -t knowledge-atlas/python-stdlib:local environments/python-stdlib
docker image inspect knowledge-atlas/python-stdlib:local --format '{{.Id}} {{.Os}}/{{.Architecture}}'
docker run --rm --network none knowledge-atlas/python-stdlib:local
```

## 独立工作目录

下面新建一个本地工作目录，不挂载整个仓库；输出保存到宿主机，因此容器退出后仍存在。每次示例运行创建新目录，命令之间需在同一个 shell 中继续执行。

```sh
mkdir -p .local/workspaces
atlas_workspace="$(mktemp -d "$PWD/.local/workspaces/python-stdlib.XXXXXX")"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --memory 128m --cpus 1 --pids-limit 64 \
  --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --mount "type=bind,source=$atlas_workspace,target=/workspace" \
  knowledge-atlas/python-stdlib:local \
  python -c 'from pathlib import Path; Path("result.txt").write_text("A result kept outside the container.\n")'
cat "$atlas_workspace/result.txt"
```

使用宿主 UID/GID 避免在 Linux bind mount 中留下 root 所有的文件；本例验证文件留存，没有科学结论。在新容器中挂载同一目录即可继续。实际实验应提供代码和输入只读目录，以及本次独立的可写输出目录，按需求调整资源和超时。

要交互调试，可对**可信的工作目录**运行 `docker run --rm -it --user "$(id -u):$(id -g)" --mount "type=bind,source=$atlas_workspace,target=/workspace" knowledge-atlas/python-stdlib:local sh`，以 `exit` 结束。调试实例允许写临时容器层；有价值的依赖变化回写 Dockerfile，文件保存到挂载目录。示例没有长期命名卷或后台服务，不涉及自动回收用户数据。

## 可选 Dev Container

[devcontainer.json](.devcontainer/devcontainer.json) 复用同一 Dockerfile。支持自定义配置的工具可加载该文件；它将选定工作目录挂载为 `/workspace`，以 `explorer` 用户开发，不转发 Docker socket，不包含模型凭据。选择根仓库时会开放整个仓库供编辑，只用于可信开发；受限实验应使用上面的独立目录。

当前提供配置入口；Dev Containers CLI/编辑器实际启动尚未验收。使用它不保证所选 Agent 自身运行在容器内，Agent 在宿主调用 Docker 也是正式支持的方式。[Dev Container CLI](https://github.com/devcontainers/cli)

## 维护与验证

环境发生变化时重建并验证 Python 版本、非 root 执行、宿主文件留存及重新挂载读取。关键运行保存环境定义/镜像实际版本和输出记录。临时目录没有自动备份；需要长期保留的内容依 [资产维护](../../docs/EXPLORATION_ASSETS.md) 整理与备份。实际验证记录见 [验证记录](VERIFICATION.md)。
