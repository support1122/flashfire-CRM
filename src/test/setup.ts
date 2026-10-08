/// <reference types="node" />
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Tests assert on clock strings like "4:25 PM", so pin the zone the BDAs work in.
process.env.TZ = 'Asia/Kolkata';

afterEach(() => {
  cleanup();
});

// jsdom does not implement <dialog> modal behaviour in every version; give it the minimum.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal) {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (!proto.close) {
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
