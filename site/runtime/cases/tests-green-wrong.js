import { mountCaseLab } from '../core/agent-lab.js';
import { createToolCaseAdapter } from '../core/tool-case.js';
import { environment, scriptedProvider } from './tests-green-wrong-model.js';

const root = document.querySelector('[data-agent-notebook][data-case-id="tests-green-wrong"]');
mountCaseLab(root, createToolCaseAdapter({ environment, provider: scriptedProvider }));
