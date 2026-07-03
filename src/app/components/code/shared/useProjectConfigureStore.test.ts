import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetProjectConfigureStoreForTests,
  useProjectConfigureStore,
} from './useProjectConfigureStore';

describe('useProjectConfigureStore', () => {
  beforeEach(() => {
    resetProjectConfigureStoreForTests();
  });

  it('starts closed with default draft values', () => {
    expect(useProjectConfigureStore.getState()).toMatchObject({
      draft: {
        mgnt: 'none',
        mode: 'rtl2gds',
        padframe: 'QFN32',
        process: 'ics55',
        type: 'retroSoC',
      },
      errorMessage: null,
      isOpen: false,
      isSubmitting: false,
    });
  });

  it('opens with the current project config as draft', () => {
    useProjectConfigureStore.getState().openProjectConfigure({
      mgnt: 'item2',
      mode: 'rtl',
      padframe: 'QFN128',
      process: 'sky130',
      type: 'Custom',
    });

    expect(useProjectConfigureStore.getState()).toMatchObject({
      draft: {
        mgnt: 'item2',
        mode: 'rtl',
        padframe: 'QFN128',
        process: 'sky130',
        type: 'Custom',
      },
      isOpen: true,
      isSubmitting: false,
    });
  });

  it('updates draft and resets when closed', () => {
    const store = useProjectConfigureStore.getState();

    store.openProjectConfigure({
      mgnt: 'none',
      mode: 'rtl2gds',
      padframe: 'QFN32',
      process: 'ics55',
      type: 'retroSoC',
    });
    store.setDraft({
      mgnt: 'item1',
      mode: 'rtl',
      padframe: 'QFN64',
      process: 'ihp130',
      type: 'ysyxSoC',
    });
    store.setErrorMessage('Unable to save');
    store.setSubmitting(true);
    store.closeProjectConfigure();

    expect(useProjectConfigureStore.getState()).toMatchObject({
      draft: {
        mgnt: 'none',
        mode: 'rtl2gds',
        padframe: 'QFN32',
        process: 'ics55',
        type: 'retroSoC',
      },
      errorMessage: null,
      isOpen: false,
      isSubmitting: false,
    });
  });
});
