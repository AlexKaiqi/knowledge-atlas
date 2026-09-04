function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatCall(name, args) {
  const values = Object.values(args || {});
  if (!values.length) return `${name}()`;
  return `${name}(${values.map(value => JSON.stringify(value)).join(', ')})`;
}

/**
 * Compose a domain Environment with an Agent Provider into the generic Agent Lab adapter.
 *
 * Environment owns truth, tools, observers, and verdict projection.
 * Provider owns policy: which available tools to call and what to say.
 */
export function createToolCaseAdapter({ environment, provider }) {
  if (!environment || typeof environment.createInitialState !== 'function' || typeof environment.view !== 'function') {
    throw new Error('Tool Case requires an Environment with createInitialState() and view()');
  }
  if (!provider || typeof provider.run !== 'function') {
    throw new Error('Tool Case requires an Agent Provider with run()');
  }

  function toolCatalog(harness) {
    return Object.entries(environment.tools || {}).filter(([, tool]) => {
      return typeof tool.available !== 'function' || tool.available({ harness });
    }).map(([name, tool]) => ({
      name,
      description: tool.description || '',
      readOnly: Boolean(tool.readOnly)
    }));
  }

  return {
    mode: provider.mode || 'AGENT PROVIDER',
    intro: provider.intro || 'Agent Provider connected to this Case Environment.',
    createInitialState(args) {
      return environment.createInitialState(args);
    },
    view(args) {
      const base = environment.view(args);
      const preview = typeof provider.preview === 'function' ? provider.preview(args) : null;
      return preview ? { ...base, strategy: preview } : base;
    },
    async run(session) {
      const callTool = async (name, args = {}) => {
        const tool = environment.tools?.[name];
        if (!tool) throw new Error(`Unknown tool: ${name}`);
        const available = typeof tool.available !== 'function' || tool.available({ harness: session.harness, state: session.getState() });
        if (!available) {
          await session.step('warn', `permission denied: ${name}`, 0);
          throw new Error(`Tool not available under current Harness: ${name}`);
        }

        const label = typeof tool.describe === 'function' ? tool.describe(args) : formatCall(name, args);
        await session.step('tool', label);
        const outcome = await tool.execute({
          args: clone(args),
          harness: clone(session.harness),
          state: clone(session.getState()),
          manifest: session.manifest
        });
        if (outcome?.patch) session.setState(outcome.patch);
        for (const event of outcome?.events || []) await session.step(event.kind || 'info', event.text, event.delay ?? 120);
        return clone(outcome?.result ?? null);
      };

      await provider.run({
        manifest: session.manifest,
        harness: clone(session.harness),
        getState: session.getState,
        availableTools: toolCatalog(session.harness),
        callTool,
        chat: session.chat,
        render: session.render
      });
    },
    async respond(context) {
      if (typeof provider.respond !== 'function') return 'This Agent Provider does not expose a conversational policy.';
      return provider.respond({
        ...context,
        availableTools: toolCatalog(context.previewHarness),
        environment
      });
    }
  };
}
