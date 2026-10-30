let isGuardInstalled = false;
let origCreateElement: typeof Document.prototype.createElement | null = null;
let origAppendChild: any = null;
let origInsertBefore: any = null;
let guardedDoc: Document | null = null;
let guardedNodeClass: any = null;

function tagIframe(iframe: Element): void {
  try {
    (iframe as HTMLIFrameElement & { credentialless?: boolean }).credentialless = true;
    if (typeof iframe.setAttribute === 'function') {
      iframe.setAttribute('credentialless', '');
    }
  } catch {
    // Suppress attribute setting errors on exotic mock nodes
  }
}

function tagIframeTree(node: any): void {
  if (!node) return;

  if (node.nodeName && node.nodeName.toUpperCase() === 'IFRAME') {
    tagIframe(node as Element);
  }

  if ('querySelectorAll' in node && typeof node.querySelectorAll === 'function') {
    try {
      const iframes = node.querySelectorAll('iframe');
      for (let i = 0; i < iframes.length; i++) {
        tagIframe(iframes[i]);
      }
    } catch {
      // Ignore query errors on non-DOM structures
    }
  }
}

/**
 * Synchronously marks dynamically created or inserted third-party <iframe> elements
 * with `credentialless = true` BEFORE Blink initiates iframe network navigation
 * on a top-level `COEP: credentialless` route.
 */
export function installCredentiallessAdIframeGuard(
  doc: Document = typeof document !== 'undefined' ? document : (null as unknown as Document),
  nodeClass: any = typeof Node !== 'undefined' ? Node : null
): void {
  if (typeof window === 'undefined' && typeof document === 'undefined' && !doc) return;
  if (!doc) return;

  // Idempotency: do not wrap prototypes multiple times
  if (isGuardInstalled && guardedDoc === doc) return;

  guardedDoc = doc;
  origCreateElement = doc.createElement.bind(doc);

  doc.createElement = function <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: ElementCreationOptions
  ): HTMLElementTagNameMap[K] {
    const el = origCreateElement!(tagName, options);
    if (String(tagName).toLowerCase() === 'iframe') {
      tagIframe(el);
    }
    return el;
  };

  const targetNode = nodeClass || (typeof Node !== 'undefined' ? Node : null);
  if (targetNode && targetNode.prototype) {
    guardedNodeClass = targetNode;
    if (!origAppendChild) {
      origAppendChild = targetNode.prototype.appendChild;
    }
    targetNode.prototype.appendChild = function (newChild: any): any {
      tagIframeTree(newChild);
      return origAppendChild.call(this, newChild);
    };

    if (!origInsertBefore) {
      origInsertBefore = targetNode.prototype.insertBefore;
    }
    targetNode.prototype.insertBefore = function (newNode: any, refNode: any): any {
      tagIframeTree(newNode);
      return origInsertBefore.call(this, newNode, refNode);
    };
  }

  isGuardInstalled = true;
}

/**
 * Restores original DOM prototypes. Useful for test cleanup.
 */
export function uninstallCredentiallessAdIframeGuard(
  doc?: Document,
  nodeClass?: any
): void {
  const targetDoc = doc || guardedDoc || (typeof document !== 'undefined' ? document : null);

  if (targetDoc && origCreateElement) {
    targetDoc.createElement = origCreateElement as any;
    origCreateElement = null;
  }

  const targetNode = nodeClass || guardedNodeClass || (typeof Node !== 'undefined' ? Node : null);
  if (targetNode && targetNode.prototype) {
    if (origAppendChild) {
      targetNode.prototype.appendChild = origAppendChild;
      origAppendChild = null;
    }
    if (origInsertBefore) {
      targetNode.prototype.insertBefore = origInsertBefore;
      origInsertBefore = null;
    }
  }

  isGuardInstalled = false;
  guardedDoc = null;
  guardedNodeClass = null;
}
