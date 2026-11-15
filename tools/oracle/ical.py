"""The reference reading of iCalendar (RFC 5545), written to the RFC's grammar, independent of the Prism's code.

tree(raw, registry) reads an object as section 3 defines it:
  - 3.1 content lines: unfolded, name, parameters (a value may be quoted, and
    a parameter may hold several values separated by ","), value;
  - each property's value by its value type: the VALUE parameter's, else the
    default the registry gives from its section; several values where its
    grammar allows (","), a value of parts where its grammar joins them (";");
  - 3.3 value types, each to one canonical form, the same the Prism's reader
    must give (site/calendar/ical.mjs);
  - 3.6.5 time zones: a DATE-TIME with a TZID is resolved to UTC by the
    object's own VTIMEZONE (python-dateutil's tzical, an independent reading
    of its observances), else by the IANA time zone database (zoneinfo).
A value its type's grammar does not allow reads as {"invalid": value}.
"""
import datetime
import io
import re
import zoneinfo

from dateutil import tz as dateutil_tz

EPOCH = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)


def ms(dt):
    return int((dt - EPOCH).total_seconds() * 1000)


def lines(raw):
    """3.1: unfold (a CRLF followed by one space or tab), then name, parameters and value."""
    unfolded = re.sub(r"\r?\n[ \t]", "", raw)
    for line in re.split(r"\r?\n", unfolded):
        if not line.strip():
            continue
        m = re.match(r'^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^";:,]*)(?:,(?:"[^"]*"|[^";:,]*))*)*):(.*)$', line)
        if not m:
            yield {"invalid": line}
            continue
        params = {}
        for name, values in re.findall(r';([A-Za-z0-9-]+)=((?:"[^"]*"|[^";:,]*)(?:,(?:"[^"]*"|[^";:,]*))*)', m.group(2)):
            params[name.upper()] = [v[1:-1] if v.startswith('"') else v for v in split_quoted(values)]
        yield {"name": m.group(1).upper(), "params": params, "value": m.group(3)}


def split_quoted(values):
    """A parameter's values, cut at each "," outside a quoted string (3.1 param-value)."""
    out, cur, quoted = [], "", False
    for c in values:
        if c == '"':
            quoted = not quoted
        if c == "," and not quoted:
            out.append(cur)
            cur = ""
        else:
            cur += c
    return out + [cur]


def split(value, sep):
    """A value cut at each unescaped separator (a backslash escapes it in TEXT, 3.3.11)."""
    out, cur, i = [], "", 0
    while i < len(value):
        c = value[i]
        if c == "\\" and i + 1 < len(value):
            cur += value[i : i + 2]
            i += 2
            continue
        if c == sep:
            out.append(cur)
            cur = ""
        else:
            cur += c
        i += 1
    return out + [cur]


def text(value):
    """3.3.11: \\\\ \\; \\, and \\n (or \\N) are the only escapes."""
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), value)


def date(value):
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", value)
    if not m:
        return None
    try:
        datetime.date(*map(int, m.groups()))
    except ValueError:
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"


def date_time(value, zone, zones):
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)", value)
    if not m:
        return None
    y, mo, d, h, mi, s, z = m.groups()
    try:
        local = datetime.datetime(int(y), int(mo), int(d), int(h), int(mi), int(s) if int(s) < 60 else 59)
    except ValueError:
        return None
    if z:
        return {"utc": ms(local.replace(tzinfo=datetime.timezone.utc))}
    out = {"local": f"{y}-{mo}-{d}T{h}:{mi}:{s}"}
    if zone:
        out["zone"] = zone
        info = zones.get(zone)
        if info is None:
            try:
                info = zoneinfo.ZoneInfo(zone)
            except (zoneinfo.ZoneInfoNotFoundError, ValueError):
                info = None
        if info is not None:
            out["at"] = ms(local.replace(tzinfo=info))
    return out


def duration(value):
    """3.3.6: [+/-] P (weeks | days [T time] | T time), each part a count."""
    m = re.fullmatch(r"([+-]?)P(?:(\d+)W|(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)", value)
    if not m or value.rstrip("+-") in ("P", "PT") or value.endswith("T"):
        return None
    sign, w, d, h, mi, s = m.groups()
    return {"sign": -1 if sign == "-" else 1, "weeks": int(w or 0), "days": int(d or 0), "seconds": int(h or 0) * 3600 + int(mi or 0) * 60 + int(s or 0)}


def utc_offset(value):
    m = re.fullmatch(r"([+-])(\d{2})(\d{2})(\d{2})?", value)
    if not m or (m.group(1) == "-" and not any(int(x or 0) for x in m.groups()[1:])):
        return None
    return (-1 if m.group(1) == "-" else 1) * (int(m.group(2)) * 3600 + int(m.group(3)) * 60 + int(m.group(4) or 0))


def decode(kind, value, zone, zones):
    """One value, by its type (3.3), to its canonical form; None where its grammar does not allow it."""
    if kind == "BINARY":
        return {"base64": value} if re.fullmatch(r"(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?", value) else None
    if kind == "BOOLEAN":
        return {"TRUE": True, "FALSE": False}.get(value.upper())
    if kind in ("CAL-ADDRESS", "URI"):
        return value if re.fullmatch(r"[A-Za-z][A-Za-z0-9+.-]*:\S*", value) else None
    if kind == "DATE":
        d = date(value)
        return {"date": d} if d else None
    if kind == "DATE-TIME":
        return date_time(value, zone, zones)
    if kind == "DURATION":
        return duration(value)
    if kind == "FLOAT":
        return float(value) if re.fullmatch(r"[+-]?\d+(?:\.\d+)?", value) else None
    if kind == "INTEGER":
        return int(value) if re.fullmatch(r"[+-]?\d+", value) else None
    if kind == "PERIOD":
        start, _, end = value.partition("/")
        a = date_time(start, zone, zones)
        b = duration(end) if end[:1] in ("P", "+", "-") else date_time(end, zone, zones)
        return ({"start": a, "duration" if end[:1] in ("P", "+", "-") else "end": b}) if a and b else None
    if kind == "RECUR":
        parts = [p.split("=", 1) for p in value.split(";") if p]
        if not parts or any(len(p) != 2 for p in parts) or "FREQ" not in {k.upper() for k, _ in parts}:
            return None
        return {k.upper(): v for k, v in parts}
    if kind == "TEXT":
        return text(value)
    if kind == "TIME":
        m = re.fullmatch(r"(\d{2})(\d{2})(\d{2})(Z?)", value)
        return {"time": f"{m.group(1)}:{m.group(2)}:{m.group(3)}", "utc": bool(m.group(4))} if m else None
    if kind == "UTC-OFFSET":
        return utc_offset(value)
    return text(value)


def kind_of(line, registry):
    """A property's value type: its VALUE parameter's, else its section's default, else TEXT (3.8.8)."""
    known = registry["properties"].get(line["name"], {})
    return ((line["params"].get("VALUE") or [None])[0] or (known.get("types") or ["TEXT"])[0]).upper()


def value_of(line, registry, zones):
    """A property's value, read by its type, its several values and its parts as its grammar says."""
    known = registry["properties"].get(line["name"], {})
    kind = kind_of(line, registry)
    zone = (line["params"].get("TZID") or [None])[0]
    one = lambda v: (lambda got: {"invalid": v} if got is None else got)(decode(kind, v, zone, zones))
    if known.get("parts"):
        cut = split(line["value"], ";")
        return [one(p) for p in cut]
    if known.get("many"):
        return [one(v) for v in split(line["value"], ",")]
    return one(line["value"])


def zones_of(raw):
    """The object's own time zones (3.6.5), read by dateutil's tzical, an independent implementation."""
    out = {}
    blocks = re.findall(r"BEGIN:VTIMEZONE\r?\n.*?END:VTIMEZONE\r?\n?", raw, re.S)
    for block in blocks:
        try:
            cal = dateutil_tz.tzical(io.StringIO(block.replace("\r\n", "\n")))
        except Exception:  # noqa: BLE001 - an observance dateutil cannot read leaves the zone to the tz database
            continue
        for key in cal.keys():
            out[key] = cal.get(key)
    return out


def tree(raw, registry):
    """The object as components holding properties, every value read by its type."""
    zones = zones_of(raw)
    root = {"name": None, "props": [], "children": []}
    stack = [root]
    for line in lines(raw):
        if "invalid" in line:
            stack[-1]["props"].append(line)
            continue
        if line["name"] == "BEGIN":
            child = {"name": line["value"].upper(), "props": [], "children": []}
            stack[-1]["children"].append(child)
            stack.append(child)
            continue
        if line["name"] == "END":
            if len(stack) > 1:
                stack.pop()
            continue
        stack[-1]["props"].append({"name": line["name"], "params": line["params"], "value": value_of(line, registry, zones)})
    return root


def instant(value):
    """A DATE or DATE-TIME as the span gives it: an instant where it has one, else its date or its floating local time."""
    if not isinstance(value, dict):
        return None
    if "utc" in value:
        return {"at": value["utc"]}
    if "at" in value:
        return {"at": value["at"]}
    if "date" in value:
        return {"date": value["date"]}
    if "local" in value:
        return {"local": value["local"]}
    return None


def later(value, by, zones):
    """A start moved on by a DURATION (3.3.6): weeks and days by the calendar in its own zone, the rest exactly."""
    days = (by["weeks"] * 7 + by["days"]) * by["sign"]
    seconds = by["seconds"] * by["sign"]
    if "date" in value:
        d = datetime.date.fromisoformat(value["date"]) + datetime.timedelta(days=days)
        return {"date": d.isoformat()} if not seconds else None
    local = datetime.datetime.fromisoformat(value["local"]) if "local" in value else None
    if "utc" in value:
        at = EPOCH + datetime.timedelta(milliseconds=value["utc"]) + datetime.timedelta(days=days, seconds=seconds)
        return {"at": ms(at)}
    if "zone" in value and "at" in value:
        info = zones.get(value["zone"]) or zoneinfo.ZoneInfo(value["zone"])
        moved = (local + datetime.timedelta(days=days)).replace(tzinfo=info)
        return {"at": ms(moved) + seconds * 1000}
    if local is not None:
        return {"local": (local + datetime.timedelta(days=days, seconds=seconds)).isoformat()}
    return None


def span(raw, registry):
    """When the first event, to-do or journal entry starts and ends (3.6.1, 3.6.2, 3.8.2.2, 3.8.2.3, 3.8.2.5)."""
    root = tree(raw, registry)
    zones = zones_of(raw)

    def first(node):
        for child in node["children"]:
            if child["name"] in ("VEVENT", "VTODO", "VJOURNAL"):
                return child
            found = first(child)
            if found:
                return found
        return None

    c = first(root)
    if not c:
        return None
    prop = lambda name: next((p["value"] for p in c["props"] if p.get("name") == name), None)
    start = prop("DTSTART")
    if not isinstance(start, dict) or "invalid" in start:
        return None
    end = prop("DTEND") or prop("DUE")
    if isinstance(end, dict) and "invalid" not in end:
        return {"start": instant(start), "end": instant(end)}
    by = prop("DURATION")
    if isinstance(by, dict) and "invalid" not in by:
        moved = later(start, by, zones)
        return {"start": instant(start), "end": moved} if moved else None
    # Neither: a DATE start lasts its day; a DATE-TIME start is an instant (3.6.1).
    if "date" in start and c["name"] == "VEVENT":
        return {"start": instant(start), "end": {"date": (datetime.date.fromisoformat(start["date"]) + datetime.timedelta(days=1)).isoformat()}}
    return {"start": instant(start), "end": instant(start)}
