# swis
See-What-I-See
# API
## Observer
Observe DOM and send updates to DOM mirror

###[constructor] Observer(transport)
Create a new DOM observer
 * `transport` Object that allows sending and receiving DOM updates, must implement the following interface
    - `send(data)`
    - `onmessage(data)`
 
###obverse(exclude)
 * `exclude` selector to filter out DOM changes on elements matched by the selector
 
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
    
###refect(mirror)
Start reflecting DOM changes on mirror
 * `mirror` document element to use as mirror
 
###Events
 * `init`
 * `resize` Observed window has been resized `{width,height}`
 * `remotecursormove` Remote cursor has moved `{x,y}`
 
###Example

