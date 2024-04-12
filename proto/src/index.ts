export interface FanCurvePoint {
	temp: number;
	speed: number;
};

export type FanCurve = Array<FanCurvePoint>;

export interface HistoryStatOfOneServer {
	cpu_power: number;
	gpu_powers: number[];
	fan_speeds: number[];
	node_power: number;
};

export interface HistoryStat {
	nodes: Array<HistoryStatOfOneServer>;
};

export interface CurrentLimitsOfOneServer {
	cur_cpu_freq_limits: number[];
	cur_gpu_freq_limit: number;
	cur_fan_curves: FanCurve[];
}

export interface CurrentLimits {
	nodes: CurrentLimitsOfOneServer[];
}

export interface StaticInfoOfOneServer {
	cpu_supported_clocks: number[];
	num_cpu_cores: number;

	gpu_supported_clocks: number[];
	num_gpus: number;

	num_fans: number;
	fan_style: "asc" | "sc";
}

export interface StaticInfo {
	nodes: StaticInfoOfOneServer[];
}

export enum BackhomeVerdict {
	OK = 0,
	WARN = 1,
	NOTALLOWED = 2
}

export interface BackhomeConsultResult {
	total_max_power: number,
	verdict: BackhomeVerdict
}
