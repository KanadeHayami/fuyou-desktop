import reference from '../../data/reference.json';
import type { Parameter, MechanismTopic } from '../shared/reference';

type BlessRecord = { id: string; name: string; collected: boolean; weight: number | null; quality: number | null; raw: Record<string, unknown> };
export const blessRecords = reference.bless as Record<string, BlessRecord>;
export const formatValue = (value: number | null) => value === null ? '—' : Number(value.toFixed(4)).toString();
export function NumericText({ text }: { text: string }) {
  return <p class="reference-effect">{text.split(/(-?\d+(?:\.\d+)?%?)/g).map((part, index) => <span key={index} class={index % 2 ? 'num' : undefined}>{part}</span>)}</p>;
}
export function ParameterTable({ parameters, showKeys = true }: { parameters: Parameter[]; showKeys?: boolean }) {
  return parameters.length ? <table class="reference-table parameter-table"><thead><tr><th scope="col">参数</th><th scope="col">数值</th></tr></thead><tbody>{parameters.map(parameter => <tr key={parameter.key}><th scope="row">{parameter.label}{showKeys && parameter.explained && <small>{parameter.key}</small>}</th><td class="num">{formatValue(parameter.value)}{parameter.unit}</td></tr>)}</tbody></table> : <p class="reference-muted">—</p>;
}
export function BlessInformation({ id, openMechanism }: { id: string; openMechanism: (topic: MechanismTopic) => void }) {
  const record = blessRecords[id];
  return <div class="bless-information"><p>抽选权重 <b class="num">{record ? formatValue(record.weight) : '—'}</b></p><div class="reference-links"><button onClick={() => openMechanism('quality')}>查看抽取规则</button><button onClick={() => openMechanism('costs')}>查看重随与重铸</button></div></div>;
}
