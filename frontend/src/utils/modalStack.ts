type CloseHandler = () => void;

interface ModalEntry {
  id: string;
  onClose: CloseHandler;
  pushedHistory: boolean;
}

class ModalStack {
  private stack: ModalEntry[] = [];
  private isPoppingInternally = false;

  public register(id: string, onClose: CloseHandler): () => void {
    // Unregister existing if any with same id
    this.unregister(id);

    let pushed = false;
    try {
      window.history.pushState({ modalId: id }, '');
      pushed = true;
    } catch {}

    const entry: ModalEntry = { id, onClose, pushedHistory: pushed };
    this.stack.push(entry);

    const handlePopState = () => {
      if (this.isPoppingInternally) return;
      const top = this.stack[this.stack.length - 1];
      if (top && top.id === id) {
        this.stack.pop();
        try {
          top.onClose();
        } catch (err) {
          console.warn('[ModalStack] Popstate onClose error:', err);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const top = this.stack[this.stack.length - 1];
        if (top && top.id === id) {
          e.preventDefault();
          this.popTop();
        }
      } else if (e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        const isInput =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable);
        if (!isInput) {
          const top = this.stack[this.stack.length - 1];
          if (top && top.id === id) {
            e.preventDefault();
            this.popTop();
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      this.unregister(id);
    };
  }

  public unregister(id: string): void {
    const idx = this.stack.findIndex((item) => item.id === id);
    if (idx !== -1) {
      const entry = this.stack[idx];
      this.stack.splice(idx, 1);
      if (entry.pushedHistory && window.history.state?.modalId === id) {
        this.isPoppingInternally = true;
        try {
          window.history.back();
        } catch {}
        setTimeout(() => {
          this.isPoppingInternally = false;
        }, 50);
      }
    }
  }

  public hasOpenModal(): boolean {
    return this.stack.length > 0;
  }

  public popTop(): boolean {
    if (this.stack.length === 0) return false;
    const top = this.stack.pop();
    if (top) {
      if (top.pushedHistory && window.history.state?.modalId === top.id) {
        this.isPoppingInternally = true;
        try {
          window.history.back();
        } catch {}
        setTimeout(() => {
          this.isPoppingInternally = false;
        }, 50);
      }
      try {
        top.onClose();
      } catch (err) {
        console.warn('[ModalStack] popTop onClose error:', err);
      }
      return true;
    }
    return false;
  }
}

export const modalStack = new ModalStack();
