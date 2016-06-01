# swis
See-What-I-See
# API
## Observer
Observe DOM and send updates to DOM mirror

###[constructor] Observer(transport,options)
Create a new DOM observer
 * `transport` Object that allows sending and receiving DOM updates, must implement the following interface
    - `send(data)`
    - `onmessage(data)`
* `options` Object that allows to customize observer
    - `blob` boolean: Set if messages should be sent using a Blog or an ArrayBuffer
 
###obverse(exclude)
Start obverving DOM changes and send changes over transport to a reflector
 * `exclude` selector to filter out DOM changes on elements matched by the selector
 
###stop()
Stop observing DOM changes
 
###Events
 * `remotecursormove` Remote cursor has moved `{x,y}`
 
##Reflector
Display a DOM mirror

###[constructor] Reflector(transport,options)
Create a new DOM reflector
 * `transport` Object that allows sending and receiving DOM updates, must implement the following interface
    - `send(data)`
    - `onmessage(data)`
* `options` Object that allows to customize reflector
    - `blob` boolean: Set if messages should be sent using a Blog or an ArrayBuffer
    - `chunk` boolean: Set if messages are received in chunks, if set, `blob`option will be overriden to false
    - `recording` boolean: Store session recording so it can be later downloaded
    
###refect(mirror,options)
Start reflecting DOM changes on mirror
 * `mirror` document element to use as mirror
 * `options` 
    - `scrollSync` boolean: Set if scrollSync is enabled or deisabled by default (see below).
 
###paint(flag)
Set viewing or editing mode
 * `flag` boolean: If true, enter in painting mode, if false, in editing mode

###clear()
Clear local and remote paintings and highlited selections

###scroll(left,top)
Scroll remote window
 * `left` integer: is the pixel along the vertical axis of the document that you want displayed in the upper left.
 * `top` integer: is the pixel along the vertical axis of the document that you want displayed in the upper left.
 
###scrollSync(flag)
Enable or disable scroll syncing of inner document elements
 * `flag` boolean: If true, scroll is synced, if false, no scroll is done on observer side
 
###refresh()
Request a full refresh of document body to thhe observer

###download()
Download recording file of current session
 
###stop()
Stop reflecting DOM changes on mirror
 
###Events
 * `init` The reflection session has been started by the remote observer `{href}`
 * `resize` Observed window has been resized `{width,height,scrollWidth,scrollHeight}`
 * `scroll` Observed window has been scrolled `{left,top}`
 * `remotecursormove` Remote cursor has moved `{x,y}`
 
