import { renderWorkspace } from './workspace.mjs';
export function renderPractice({ knowledge = [], guides = {}, questions = [] } = {}) {
  return renderWorkspace({ root: '../', initialScene: 'practice', knowledge, guides, questions });
}
