import { renderWorkspace } from './workspace.mjs';
export function renderWikiIndex({ knowledge, guides = {}, questions = [] }) {
  return renderWorkspace({ root: '../', initialScene: 'knowledge', knowledge, guides, questions });
}
