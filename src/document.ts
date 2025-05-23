import type * as t from "./vendor/pdfium.js";

import { PDFiumPage } from "./page.js";

export class PDFiumDocument {
  private readonly module: t.PDFium;

  // ID to interact with the document in the PDFium library
  private readonly documentIdx: number;

  // Pointer to the document in the WASM memory to free it later
  private readonly documentPtr: number;

  // Form handle for rendering and interacting with form fields
  private formHandle: number | null = null;

  constructor(options: {
    module: t.PDFium;
    documentIdx: number;
    documentPtr: number;
  }) {
    this.module = options.module;
    this.documentPtr = options.documentPtr;
    this.documentIdx = options.documentIdx;
  }

  /**
   * Initialize form environment for this document
   * This is required for rendering form fields such as signatures.
   * @returns The form handle
   */
  initializeFormFields(): void {
    if (this.formHandle !== null) {
      return;
    }
    // Allocate memory for the form callbacks structure
    const callbacksSize = 2 * 4; // Size for version field (4 bytes)
    const callbacksPtr = this.module.wasmExports.malloc(callbacksSize);

    // Zero out the entire callbacks structure first (equivalent to memset in C)
    for (let i = 0; i < callbacksSize / 4; i++) {
      this.module.HEAP32[(callbacksPtr / 4) + i] = 0;
    }
    //Set the version field to 2
    this.module.HEAP32[callbacksPtr / 4] = 2;
    this.formHandle = this.module._FPDFDOC_InitFormFillEnvironment(this.documentIdx, callbacksPtr);
  }

  /**
   * Get a page from the document by its index. The index is zero-based.
   */
  getPage(pageIndex: number): PDFiumPage {
    const page = this.module._FPDF_LoadPage(this.documentIdx, pageIndex);
    if (this.formHandle) {
      this.module._FORM_OnAfterLoadPage(page, this.formHandle);
    }
    return new PDFiumPage({
      module: this.module,
      pageIdx: page,
      documentIdx: this.documentIdx,
      pageIndex: pageIndex,
      formHandle: this.formHandle,
    });
  }

  /**
   * User-friendly iterator to iterate over all pages in the document.
   */
  *pages(): Generator<PDFiumPage> {
    const pageCount = this.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      yield this.getPage(i);
    }
  }

  /**
   * Get the number of pages in the document.
   */
  getPageCount(): number {
    return this.module._FPDF_GetPageCount(this.documentIdx);
  }

  /**
   * After you're done with the document, you should destroy it to free the memory.
   *
   * Otherwise, you'll be fired from your job for causing a memory leak. 😱
   */
  destroy(): void {
    if (this.formHandle) {
      this.module._FPDFDOC_ExitFormFillEnvironment(this.formHandle);
      this.formHandle = null;
    }
    this.module._FPDF_CloseDocument(this.documentIdx);
    this.module.wasmExports.free(this.documentPtr);
  }
}
