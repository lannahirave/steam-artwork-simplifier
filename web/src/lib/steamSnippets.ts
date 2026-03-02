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
  setValue("[name='image_width']", 1000);
  setValue("[name='image_height']", 1);
  setValue("[name='visibility']", 0);
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

export const STEAM_HELPER_NOTES = [
  'Open Steam upload form, then run the snippet in DevTools Console.',
  'Workshop uses app_id/file_type/visibility fields.',
  'Featured workflow sets image_width=1000 and image_height=1.',
]
