export function HomeworkInstructions({ instructions }: { instructions?: string }) {
  const value = typeof instructions === 'string' ? instructions.trim() : '';
  const parts = value.split(/(https:\/\/[^\s<>"']+)/g);
  return (
    <section className="sv135-instructions" aria-label="Teacher instructions">
      <strong>Teacher's instructions</strong>
      <div>
        {value
          ? parts.map((part, i) => {
              if (!part.startsWith('https://')) return <span key={i}>{part}</span>;
              try {
                const url = new URL(part);
                if (url.protocol === 'https:')
                  return (
                    <a key={i} href={url.href} target="_blank" rel="noopener noreferrer">
                      {url.hostname === 'docs.google.com'
                        ? 'Open teacher document/presentation'
                        : url.hostname}
                    </a>
                  );
              } catch {
                // Treat malformed URLs as plain teacher-provided text.
              }
              return <span key={i}>{part}</span>;
            })
          : 'No additional instructions provided.'}
      </div>
    </section>
  );
}
