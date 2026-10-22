export const filesSupported = true;

/** Saves text to a local file. Nothing is uploaded; the browser writes it to disk. */
export async function saveTextFile(name: string, text: string, type = 'application/json'): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/** Lets the user choose a local file and returns its text, or null if cancelled. */
export function pickTextFile(accept = '.bbvault,application/json'): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > MAX_BACKUP_BYTES) return reject(new Error('That file is too large.'));
      file.text().then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
