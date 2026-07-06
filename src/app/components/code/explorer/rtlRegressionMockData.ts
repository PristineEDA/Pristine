export type RtlRegressionGroupId = 'cpu' | 'ip' | 'perf';
export type RtlRegressionStatus = 'idle' | 'running' | 'error' | 'passed';

export interface RtlRegressionTest {
  id: string;
  name: string;
  status: Exclude<RtlRegressionStatus, 'running'>;
}

export interface RtlRegressionGroup {
  id: RtlRegressionGroupId;
  label: string;
  tests: readonly RtlRegressionTest[];
}

export const RTL_REGRESSION_GROUPS: readonly RtlRegressionGroup[] = [
  {
    id: 'cpu',
    label: 'cpu',
    tests: [
      { id: 'cpu-reset-vector', name: 'reset_vector_boot', status: 'passed' },
      { id: 'cpu-alu-smoke', name: 'alu_smoke_ops', status: 'idle' },
      { id: 'cpu-branch-hazard', name: 'branch_hazard_flush', status: 'error' },
      { id: 'cpu-csr-access', name: 'csr_access_matrix', status: 'passed' },
      { id: 'cpu-interrupt-entry', name: 'interrupt_entry_exit', status: 'idle' },
      { id: 'cpu-load-store', name: 'load_store_forwarding', status: 'passed' },
      { id: 'cpu-pipeline-stall', name: 'pipeline_stall_replay', status: 'idle' },
      { id: 'cpu-mul-div', name: 'mul_div_corner_cases', status: 'error' },
    ],
  },
  {
    id: 'ip',
    label: 'ip',
    tests: [
      { id: 'ip-uart-loopback', name: 'uart_loopback_baud_sweep', status: 'passed' },
      { id: 'ip-spi-mode', name: 'spi_mode_matrix', status: 'idle' },
      { id: 'ip-i2c-arbitration', name: 'i2c_arbitration_loss', status: 'passed' },
      { id: 'ip-gpio-irq', name: 'gpio_irq_edge_level', status: 'error' },
      { id: 'ip-timer-prescale', name: 'timer_prescale_wrap', status: 'idle' },
      { id: 'ip-dma-burst', name: 'dma_burst_alignment', status: 'passed' },
      { id: 'ip-axi-lite', name: 'axi_lite_backpressure', status: 'idle' },
      { id: 'ip-reset-sync', name: 'reset_sync_assertion', status: 'passed' },
    ],
  },
  {
    id: 'perf',
    label: 'perf',
    tests: [
      { id: 'perf-coremark', name: 'coremark_fast_model', status: 'idle' },
      { id: 'perf-icache-miss', name: 'icache_miss_latency', status: 'passed' },
      { id: 'perf-dcache-stream', name: 'dcache_stream_stride', status: 'idle' },
      { id: 'perf-bus-contention', name: 'bus_contention_peak', status: 'error' },
      { id: 'perf-wfi-wakeup', name: 'wfi_wakeup_latency', status: 'passed' },
      { id: 'perf-irq-throughput', name: 'irq_throughput_sweep', status: 'idle' },
      { id: 'perf-dma-copy', name: 'dma_copy_bandwidth', status: 'passed' },
      { id: 'perf-branch-mix', name: 'branch_mix_regression', status: 'idle' },
    ],
  },
];

export const RTL_REGRESSION_GROUP_IDS = RTL_REGRESSION_GROUPS.map((group) => group.id);
