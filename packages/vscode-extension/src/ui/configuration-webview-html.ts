export function getConfigurationHtml(nonce: string, scriptUri: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>n8n Configuration</title>
  <style>
    :root { --border: var(--vscode-panel-border, var(--vscode-input-border)); --muted: var(--vscode-descriptionForeground); --surface: var(--vscode-editor-background); --soft: color-mix(in srgb, var(--vscode-input-background) 72%, transparent); --accent: var(--vscode-button-background); }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--surface); color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    #root { min-height: 100vh; }
    .settings-shell { min-height: 100vh; display: grid; grid-template-columns: 190px minmax(0, 1fr); }
    .sidebar { border-right: 1px solid var(--border); background: color-mix(in srgb, var(--vscode-sideBar-background, var(--surface)) 88%, var(--surface)); padding: 14px 8px; display: grid; align-content: start; gap: 6px; }
    .sidebar-title { padding: 0 8px 10px; font-weight: 700; }
    .tab-button { width: 100%; justify-content: flex-start; text-align: left; color: var(--vscode-foreground); background: transparent; border-color: transparent; display: flex; gap: 8px; align-items: center; font-weight: 600; }
    .tab-button.active { background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground)); }
    .page { max-width: 1240px; width: 100%; padding: 18px; display: grid; gap: 14px; }
    header, .panel-head, .card-top, .modal-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    header { align-items: flex-end; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; line-height: 1.2; }
    h2 { font-size: 16px; }
    h3 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .muted, .subtle { color: var(--muted); line-height: 1.45; }
    .subtle { font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; align-items: start; }
    .panel, .card, .modal-card { border: 1px solid var(--border); background: var(--soft); border-radius: 10px; padding: 14px; display: grid; gap: 12px; }
    .card { background: var(--vscode-editor-background); border-radius: 14px; }
    .card.clickable { cursor: pointer; text-align: left; color: inherit; width: 100%; }
    .card.clickable:hover, .card.clickable:focus-visible { border-color: var(--vscode-focusBorder, var(--accent)); outline: 1px solid var(--vscode-focusBorder, var(--accent)); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .stack { display: grid; gap: 10px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .badge { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 11px; color: var(--muted); background: transparent; min-height: 22px; }
    .badge.button { cursor: pointer; }
    .badge.ready, .badge.started { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, var(--vscode-foreground)) 55%, var(--border)); }
    .badge.warning, .badge.installing { color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, var(--vscode-foreground)) 55%, var(--border)); }
    .badge.error, .badge.failed { color: var(--vscode-errorForeground); border-color: color-mix(in srgb, var(--vscode-errorForeground) 55%, var(--border)); }
    .badge.active { color: var(--vscode-button-foreground); background: var(--accent); border-color: var(--accent); }
    label { display: grid; gap: 6px; font-size: 12px; color: var(--muted); font-weight: 600; }
    input, select, textarea { width: 100%; min-height: 36px; padding: 8px 10px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--border)); border-radius: 6px; }
    textarea { min-height: 76px; resize: vertical; }
    input:focus, select:focus, textarea:focus, button:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    button { min-height: 34px; border: 1px solid transparent; border-radius: 6px; padding: 0 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font-weight: 600; cursor: pointer; }
    button.secondary { color: var(--vscode-foreground); background: transparent; border-color: var(--border); }
    button.danger { background: var(--vscode-errorForeground); color: var(--vscode-editor-background); }
    button.link { min-height: 0; padding: 0; border: 0; background: transparent; color: var(--vscode-textLink-foreground); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .inline-message { border: 1px solid var(--border); border-radius: 8px; padding: 10px; color: var(--muted); background: color-mix(in srgb, var(--vscode-input-background) 84%, transparent); }
    .inline-message.warning { color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); }
    .inline-message.error { color: var(--vscode-errorForeground); }
    .modal-backdrop { position: fixed; inset: 0; background: color-mix(in srgb, var(--vscode-editor-background) 62%, black); display: grid; place-items: center; padding: 18px; z-index: 10; }
    .modal-card { width: min(720px, 100%); max-height: min(760px, 94vh); overflow: auto; background: var(--vscode-editor-background); }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    @media (max-width: 720px) { .settings-shell { grid-template-columns: 1fr; } .sidebar { border-right: 0; border-bottom: 1px solid var(--border); } }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
