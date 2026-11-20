// Written by generators/guests (guestask). Do not edit.
// How a generated page module asks its guest. The guest decides everything: it
// answers "done <fields>", "refuse <code> <reason>", or "need <fact>", naming a
// fact only the browser host can give. This gives the fact and asks again with
// it appended, so no page module holds logic of its own.

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const fail = (code, message) => Object.assign(new Error(message), { code });

// The host's facts. A fact about bytes that were not given is "-".
const HOST = {
  digest: async (blob, algorithm) => (blob ? hex(new Uint8Array(await crypto.subtle.digest(algorithm, blob))) : '-'),
  skip: async () => '-',
};

export const word = (dispatch, name) => async (line) => String(await dispatch(`${name} ${line}`)).trim();

export async function ask(decide, words, blob) {
  let line = words.join(' ');
  for (let turn = 0; turn < 8; turn += 1) {
    const [head, ...rest] = String(await decide(line)).trim().split(' ');
    if (head === 'done') return rest;
    if (head === 'refuse') throw fail(rest[0], rest.slice(1).join(' '));
    if (head !== 'need' || !Object.hasOwn(HOST, rest[0])) return null;
    line += ` ${await HOST[rest[0]](blob, ...rest.slice(1))}`;
  }
  return null;
}

// The answer's words under their names: "-" is left out, a name ending in # is a number.
export function fields(answer, names) {
  if (names === null) {
    if (!answer || answer.length !== 1) throw fail('glue.answer', 'the guest gave no answer');
    return answer[0];
  }
  if (!answer || answer.length > names.length) return { outcome: 'invalid' };
  const out = {};
  answer.forEach((value, i) => {
    if (value !== '-') out[names[i].replace('#', '')] = names[i].endsWith('#') ? Number(value) : value;
  });
  return out;
}
