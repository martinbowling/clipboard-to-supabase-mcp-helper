declare module 'clipboard-event' {
  interface ClipboardListener {
    startListening(): void;
    stopListening(): void;
    on(event: 'change', listener: () => void): void;
  }
  const clipboardListener: ClipboardListener;
  export = clipboardListener;
}