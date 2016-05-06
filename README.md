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
 
###Example

##Reflector
Display a DOM mirror

###[constructor] Reflector(transport)
Create a new DOM reflector
 * `transport` Object that allows sending and receiving DOM updates, must implement the following interface
    - `send(data)`
    - `onmessage(data)`
* `options` Object that allows to customize reflector
    - `blob` boolean: Set if messages should be sent using a Blog or an ArrayBuffer
    
###refect(mirror)
Start reflecting DOM changes on mirror
 * `mirror` document element to use as mirror

###paint(flag)
Set viewing or editing mode
 * `flag` boolean: If true, enter in painting mode, if false, in editing mode

###clear()
Clear local and remote paintings and highlited selections

###stop()
Stop reflecting DOM changes on mirror
 
###Events
 * `init`
 * `resize` Observed window has been resized `{width,height}`
 * `remotecursormove` Remote cursor has moved `{x,y}`
 
###Example

