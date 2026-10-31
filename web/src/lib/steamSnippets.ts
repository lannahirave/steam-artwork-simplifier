export const WORKSHOP_SNIPPET = `(() => {
  const INVISIBLE_TITLE = "\\u200E ";
  function emit(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function setValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.value = String(value);
    emit(el, "input");
    emit(el, "change");
  }
  if (typeof window.$J === "function") {
    $J("[name=consumer_app_id]").val(480);
    $J("[name=file_type]").val(0);
    $J("[name=visibility]").val(0);
  } else {
    setValue("[name='consumer_app_id']", 480);
    setValue("[name='file_type']", 0);
    setValue("[name='visibility']", 0);
  }
  const title = document.querySelector("#title[name='title']");
  if (title) {
    title.value = INVISIBLE_TITLE;
    emit(title, "input");
    emit(title, "change");
  }
  const agree = document.querySelector("#agree_terms[name='agree_terms']");
  if (agree) {
    agree.checked = true;
    emit(agree, "input");
    emit(agree, "change");
  }
})();`

export const FEATURED_SNIPPET = `(() => {
  const INVISIBLE_TITLE = "\\u200E ";
  function emit(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function setValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.value = String(value);
    emit(el, "input");
    emit(el, "change");
  }
  if (typeof window.$J === "function") {
    $J('#image_width').val(1000).attr('id',''),$J('#image_height').val(1).attr('id','');
    $J("[name=visibility]").val(0);
  } else {
    setValue("[name='image_width']", 1000);
    setValue("[name='image_height']", 1);
    setValue("[name='visibility']", 0);
  }
  const title = document.querySelector("#title[name='title']");
  if (title) {
    title.value = INVISIBLE_TITLE;
    emit(title, "input");
    emit(title, "change");
  }
  const agree = document.querySelector("#agree_terms[name='agree_terms']");
  if (agree) {
    agree.checked = true;
    emit(agree, "input");
    emit(agree, "change");
  }
})();`

export const SCREENSHOT_SNIPPET = `(() => {
  const INVISIBLE_TITLE = "\\u200E ";
  function emit(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function setValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.value = String(value);
    emit(el, "input");
    emit(el, "change");
  }
  if (typeof window.$J === "function") {
    $J('#image_width').val(1000).attr('id',''),$J('#image_height').val(1).attr('id',''),$J('[name=file_type]').val(5);
    $J("[name=visibility]").val(0);
  } else {
    setValue("[name='image_width']", 1000);
    setValue("[name='image_height']", 1);
    setValue("[name='file_type']", 5);
    setValue("[name='visibility']", 0);
  }
  const title = document.querySelector("#title[name='title']");
  if (title) {
    title.value = INVISIBLE_TITLE;
    emit(title, "input");
    emit(title, "change");
  }
  const agree = document.querySelector("#agree_terms[name='agree_terms']");
  if (agree) {
    agree.checked = true;
    emit(agree, "input");
    emit(agree, "change");
  }
})();`

export type SteamUploadType = 'workshop' | 'featured' | 'screenshot'

export const STEAM_UPLOAD_URL = 'https://steamcommunity.com/sharedfiles/edititem/767/3/'

export const SINGLE_SNIPPETS: Record<SteamUploadType, string> = {
  workshop: WORKSHOP_SNIPPET,
  featured: FEATURED_SNIPPET,
  screenshot: SCREENSHOT_SNIPPET,
}

export type SteamVisibility = 0 | 1 | 2 | 3

export const STEAM_VISIBILITIES: SteamVisibility[] = [0, 1, 2, 3]

export interface BatchSnippetSettings {
  appId: number
  visibility: SteamVisibility
  delayMs: number
}

export const DEFAULT_APP_ID: Record<SteamUploadType, number> = {
  workshop: 480,
  featured: 767,
  screenshot: 767,
}

export const DEFAULT_VISIBILITY: SteamVisibility = 0
export const DEFAULT_DELAY_SECONDS = 3
export const MIN_DELAY_SECONDS = 1
export const MAX_DELAY_SECONDS = 60

export function defaultBatchSettings(type: SteamUploadType): BatchSnippetSettings {
  return {
    appId: DEFAULT_APP_ID[type],
    visibility: DEFAULT_VISIBILITY,
    delayMs: DEFAULT_DELAY_SECONDS * 1000,
  }
}

export function parseAppId(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d{1,10}$/.test(trimmed)) return null
  const appId = Number(trimmed)
  return appId > 0 && appId <= 4294967295 ? appId : null
}

export function parseDelaySeconds(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  const seconds = Number(trimmed)
  return seconds >= MIN_DELAY_SECONDS && seconds <= MAX_DELAY_SECONDS ? seconds : null
}

function batchOverrides(type: SteamUploadType, appId: number): string {
  switch (type) {
    case 'workshop':
      return `{ consumer_app_id: ${appId}, file_type: 0 }`
    case 'featured':
      return `{ consumer_app_id: ${appId}, image_width: 1000, image_height: 1 }`
    case 'screenshot':
      return `{ consumer_app_id: ${appId}, image_width: 1000, image_height: 1, file_type: 5 }`
  }
}

export interface BatchSnippetLabels {
  choose: string
  progress: string
  done: string
  wrongPage: string
}

export function buildBatchSnippet(
  type: SteamUploadType,
  settings: BatchSnippetSettings,
  labels: BatchSnippetLabels,
): string {
  return `(async () => {
  const TYPE = ${JSON.stringify(type)};
  const OVERRIDES = ${batchOverrides(type, settings.appId)};
  const TITLE = "\\u200E ";
  const VISIBILITY = ${settings.visibility};
  const DELAY_MS = ${Math.round(settings.delayMs)};
  const MAX_BYTES = 5242880;
  const LABELS = ${JSON.stringify(labels)};

  const source = document.getElementById("SubmitItemForm");
  if (location.hostname !== "steamcommunity.com" || !source) {
    alert(LABELS.wrongPage);
    return;
  }
  const uploadUrl = /ugcupload/.test(source.action)
    ? source.action
    : "https://depot-ingest.discovery.steamserver.net/ugcupload/39";
  const hidden = {};
  for (const el of source.elements) if (el.type === "hidden") hidden[el.name] = el.value;

  const button = document.createElement("button");
  button.textContent = LABELS.choose;
  button.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;padding:14px 26px;border:0;border-radius:999px;background:#0071e3;color:#fff;font:600 17px Arial,sans-serif;cursor:pointer";
  document.body.appendChild(button);

  const picker = document.createElement("input");
  picker.type = "file";
  picker.multiple = true;
  picker.accept = ".gif,.png,.jpg,.jpeg";
  const files = await new Promise((resolve) => {
    picker.onchange = () => resolve(Array.from(picker.files));
    button.onclick = () => picker.click();
  });
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  button.onclick = null;
  button.style.cursor = "default";

  const measure = (file) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { resolve([img.naturalWidth, img.naturalHeight]); URL.revokeObjectURL(img.src); };
    img.onerror = () => resolve([0, 0]);
    img.src = URL.createObjectURL(file);
  });

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    button.textContent = LABELS.progress.replace("%n", i + 1).replace("%total", files.length);
    if (file.size > MAX_BYTES) {
      results.push({ file: file.name, id: null, status: "SKIPPED (over 5 MB)" });
      continue;
    }
    const [width, height] = await measure(file);
    const fields = Object.assign({}, hidden, {
      cloudfilenameprefix: Math.floor(Date.now() / 1000) + "_" + i + "_new_",
      image_width: width,
      image_height: height,
    }, OVERRIDES, {
      title: TITLE,
      description: "",
      visibility: VISIBILITY,
      agree_terms: "on",
    });

    const frame = document.createElement("iframe");
    frame.name = "upload_" + Date.now() + "_" + i;
    frame.style.display = "none";
    const form = document.createElement("form");
    form.method = "post";
    form.enctype = "multipart/form-data";
    form.action = uploadUrl;
    form.target = frame.name;
    form.style.display = "none";
    for (const name of Object.keys(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = String(fields[name]);
      form.appendChild(input);
    }
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.name = "file";
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    form.appendChild(fileInput);
    document.body.append(frame, form);

    const landed = await new Promise((resolve) => {
      frame.onload = () => {
        let href = "";
        try { href = frame.contentWindow.location.href; } catch { resolve(""); return; }
        if (href !== "about:blank") resolve(href);
      };
      form.submit();
    });
    const id = landed ? new URL(landed).searchParams.get("id") : null;
    results.push({ file: file.name, id, status: id ? "OK" : "FAILED" });
    console.log(i + 1 + "/" + files.length, file.name, id ? "OK " + id : "FAILED");
    form.remove();
    frame.remove();
    if (i < files.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const ok = results.filter((r) => r.status === "OK").length;
  button.textContent = LABELS.done.replace("%ok", ok).replace("%failed", results.length - ok);
  console.table(results);
  console.log(TYPE + ": " + ok + " of " + results.length + " uploaded");
})();`
}
