import { renderWorkspace } from './workspace.mjs';
// Keep existing public URLs; reading, proposals and history share the workspace.
export function renderWiki({ knowledge, knowledgeCatalog = [knowledge], guides = {}, questions = [] }) {
  return renderWorkspace({ root: '../../', initialScene: 'knowledge', initialKnowledge: knowledge.id, knowledge: knowledgeCatalog, guides, questions });
}
