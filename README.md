# Wikidata Class Hierarchy Visualization

[Wikidata](https://www.wikidata.org/wiki/Wikidata:Main_Page)  is an open  [knowledge base](https://en.wikipedia.org/wiki/Knowledge_base)  with a class hierarchy via the  [subclass property](https://www.wikidata.org/wiki/Property:P279).

Class hierarchies are useful as they convey taxonomical information and inherited properties.

Though visiting superclasses is possible via the Wikidata interface, it is non-trivial to explore the subclasses in a visual or non-local fashion.

Visualizing subclass relationships in a non-local fashion is particularly useful since we might want to visually capture implicit subclasses (via transitivity) or intuitively visualize relationships among siblings (i.e. classes with a common superclass).

This repository contains functionality for visualizing the [Wikidata](https://www.wikidata.org/wiki/Wikidata:Main_Page)  class hierarchy in a way that focuses on conveying transitive and sibling relationships.

A live demo can be found at [https://paul-tqh-nguyen.github.io/wikidata_class_hierarchy_visualization/](https://paul-tqh-nguyen.github.io/wikidata_class_hierarchy_visualization/)

The tools used here include
* [D3.js](https://d3js.org/)
* [Pyppeteer](https://github.com/miyakogi/pyppeteer) (for interactive [Wikidata Query Service](https://query.wikidata.org/) scraping)
* [NetworkX](https://networkx.github.io/)
* [psutil](https://psutil.readthedocs.io/en/latest/)
* [asyncio (Python library)](https://docs.python.org/3/library/asyncio.html)
* [json (Python library)](https://docs.python.org/3/library/json.html)