(() => {
  "use strict";

  // Invisible title value: LRM + space
  const INVISIBLE_TITLE = "\u200E ";

  function emit(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function createTitleBox() {
    const box = document.createElement("div");
    box.className = "detailBox collection";

    const arrow = document.createElement("div");
    arrow.className = "createCollectionArrow";
    box.appendChild(arrow);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "Give your artwork a title";
    box.appendChild(title);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "titleField";
    input.id = "title";
    input.name = "title";
    input.maxLength = 128;
    input.value = "";
    box.appendChild(input);

    const clear = document.createElement("div");
    clear.style.clear = "left";
    box.appendChild(clear);

    return box;
  }

  function ensureTitleInput() {
    let titleInput = document.querySelector("#title[name='title']");
    if (titleInput) return titleInput;

    const titleBox = createTitleBox();
    const submitBtn =
      document.querySelector("#SubmitItemBtn") ||
      document.querySelector("button[type='submit']") ||
      document.querySelector("input[type='submit']");

    if (submitBtn && submitBtn.parentElement) {
      submitBtn.parentElement.insertBefore(titleBox, submitBtn);
    } else {
      const form = document.querySelector("form");
      if (form) {
        form.appendChild(titleBox);
      } else {
        document.body.appendChild(titleBox);
      }
    }

    return titleBox.querySelector("#title");
  }

  function setInputValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.value = String(value);
    emit(el, "input");
    emit(el, "change");
    return true;
  }

  function applyHiddenFields() {
    if (typeof window.$J === "function") {
      // Requested Steam console command
      $J("[name=consumer_app_id]").val(480);
      $J("[name=file_type]").val(0);
      $J("[name=visibility]").val(0);
      return;
    }

    setInputValue("[name='consumer_app_id']", 480);
    setInputValue("[name='file_type']", 0);
    setInputValue("[name='visibility']", 0);
  }

  function checkAgreement() {
    const agree = document.querySelector("#agree_terms[name='agree_terms']");
    if (!agree) return false;
    agree.checked = true;
    emit(agree, "input");
    emit(agree, "change");
    return true;
  }

  const titleInput = ensureTitleInput();
  if (titleInput) {
    titleInput.value = INVISIBLE_TITLE;
    emit(titleInput, "input");
    emit(titleInput, "change");
  }

  const agreeSet = checkAgreement();
  applyHiddenFields();

  console.log(
    "[steam_upload_autofill] done",
    {
      titleSet: !!titleInput,
      agreeSet,
      invisibleTitleCodepoints: [...INVISIBLE_TITLE].map((c) =>
        c.codePointAt(0).toString(16).toUpperCase()
      ),
    }
  );
})();
