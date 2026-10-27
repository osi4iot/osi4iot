import '@testing-library/jest-dom/vitest';

// jsdom no implementa ResizeObserver (lo usan floating-ui / react-datepicker)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as any).ResizeObserver = ResizeObserverStub;
}
