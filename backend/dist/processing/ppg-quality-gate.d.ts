import { SignalSample, WellnessConfidence } from './interfaces';
export declare function sanitize(samples: SignalSample[]): SignalSample[];
export declare function confidenceLevel(rawValue: number): WellnessConfidence;
