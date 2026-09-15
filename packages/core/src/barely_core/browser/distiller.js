/**
 * Barely DOM Distiller
 * Injected into the browser to extract a lightweight Accessibility Tree.
 * Solves Bottleneck 2: Context Window Overload.
 */
function distillDOM() {
    // Clear old tags from previous steps to prevent duplicate IDs
    document.querySelectorAll('[barely-id]').forEach(el => {
        el.removeAttribute('barely-id');
        el.style.outline = '';
    });

    let elementIdCounter = 1;
    const elementsMap = new Map();
    const interactiveElements = [];

    function isInteractive(el) {
        const tag = el.tagName.toLowerCase();
        if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) return true;
        if (el.hasAttribute('onclick') || el.getAttribute('role') === 'button') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function isVisible(el) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return true;
    }

    function traverse(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        
        const tag = node.tagName.toLowerCase();
        // Skip non-visual or layout-heavy elements
        if (['script', 'style', 'noscript', 'meta', 'link', 'svg'].includes(tag)) return;
        if (!isVisible(node)) return;

        if (isInteractive(node)) {
            const id = elementIdCounter++;
            const rawText = node.innerText?.trim() 
                || node.value?.trim() 
                || node.getAttribute('aria-label') 
                || node.getAttribute('placeholder') 
                || node.getAttribute('title')
                || node.getAttribute('alt')
                || node.querySelector('img')?.getAttribute('alt')
                || node.getAttribute('name')
                || '';
            
            // Highlight element in the UI for visual debugging/screenshots
            node.setAttribute('barely-id', id);
            node.style.outline = '2px solid red';
            
            const elementData = {
                id: id,
                tag: tag,
                text: rawText.substring(0, 60),
                placeholder: node.getAttribute('placeholder') || null,
                aria_label: node.getAttribute('aria-label') || null,
                name: node.getAttribute('name') || null,
                type: node.type || null
            };
            
            interactiveElements.push(elementData);
            elementsMap.set(id, node);
        }

        for (const child of node.childNodes) {
            traverse(child);
        }
    }

    traverse(document.body);

    return interactiveElements;
}

// Execute and return the simplified tree to Python
return distillDOM();
