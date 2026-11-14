"""Reads a facet's spec.json and answers requests exactly as the spec says.

Two spec shapes decide a request:
  prism/spec/1   first matching rule in `rules`, else `otherwise`
  tree           `tree`: {"if": [field, value], "then": ..., "else": ...}

A request is the space-separated field values in field order, as in the
spec's examples. Number fields carry a closed range [min, max].
"""
import itertools
import json


class Spec:
    def __init__(self, path):
        self.path = path
        self.raw = json.loads(open(path, encoding="utf-8").read())
        d = self.raw
        self.name = d["name"]
        self.fields = d["fields"]
        self.names = [f["name"] for f in self.fields]
        self.outcomes = d["outcomes"]
        self.shape = "rules" if "rules" in d else "tree" if "tree" in d else None
        if self.shape is None:
            raise ValueError(f"{path}: neither rules nor tree")

    # --- the field space ---------------------------------------------------
    def is_number(self, f):
        return f.get("kind") == "number"

    def constants(self, name):
        """Every number a rule compares this field with."""
        out = set()
        for r in self.raw.get("rules", []):
            for c in r["when"]:
                if c["field"] == name and isinstance(c["value"], int):
                    out.add(c["value"])
        return out

    def domain(self, f):
        """The values a witness search tries for one field: every choice,
        or, for a number, the whole range when small and otherwise its ends,
        its first few values and every rule constant with its neighbours."""
        if not self.is_number(f):
            return list(f["values"])
        lo, hi = f["min"], f["max"]
        if hi - lo <= 32:
            return list(range(lo, hi + 1))
        picks = set(range(lo, lo + 6)) | {hi - 1, hi}
        for k in self.constants(f["name"]):
            picks |= {k - 1, k, k + 1}
        return sorted(v for v in picks if lo <= v <= hi)

    def space(self):
        return itertools.product(*(self.domain(f) for f in self.fields))

    # --- requests ------------------------------------------------------------
    def parse(self, request):
        """A request line to a field tuple, or None when the spec would call
        it invalid (wrong arity, unknown value, number out of range)."""
        parts = request.split(" ")
        if len(parts) != len(self.fields) or any(p == "" for p in parts):
            return None
        out = []
        for f, p in zip(self.fields, parts):
            if self.is_number(f):
                if not p.isdigit() or (len(p) > 1 and p[0] == "0"):
                    return None
                v = int(p)
                if not f["min"] <= v <= f["max"]:
                    return None
                out.append(v)
            else:
                if p not in f["values"]:
                    return None
                out.append(p)
        return tuple(out)

    def line(self, x):
        return " ".join(str(v) for v in x)

    def examples(self):
        for e in self.raw.get("examples", []):
            if isinstance(e, dict):
                yield e["request"], e["response"]
            else:
                yield e[0], e[1]

    # --- the decision ------------------------------------------------------
    def _holds(self, c, env):
        a = env[c["field"]]
        b = c["value"]
        if isinstance(b, dict):
            b = env[b["field"]]
        op = c["op"]
        if op == "is" or op == "=":
            return a == b
        if op == "is not":
            return a != b
        if op == "<":
            return a < b
        if op == "<=":
            return a <= b
        if op == ">":
            return a > b
        if op == ">=":
            return a >= b
        raise ValueError(f"{self.path}: unknown op {op!r}")

    def decide(self, x):
        """(answer, branch): branch names the rule or tree leaf that answered."""
        env = dict(zip(self.names, x))
        if self.shape == "rules":
            for r in self.raw["rules"]:
                if all(self._holds(c, env) for c in r["when"]):
                    return r["then"], r["id"]
            return self.raw["otherwise"], "otherwise"
        node, path = self.raw["tree"], "T"
        while isinstance(node, dict):
            field, value = node["if"]
            if env[field] == value:
                node, path = node["then"], path + "1"
            else:
                node, path = node["else"], path + "0"
        return node, path

    def answer(self, x):
        return self.decide(x)[0]

    def branches(self):
        """Every rule id, or every tree leaf path, the spec writes."""
        if self.shape == "rules":
            return [r["id"] for r in self.raw["rules"]] + ["otherwise"]
        out = []

        def walk(node, path):
            if isinstance(node, dict):
                walk(node["then"], path + "1")
                walk(node["else"], path + "0")
            else:
                out.append(path)
        walk(self.raw["tree"], "T")
        return out
