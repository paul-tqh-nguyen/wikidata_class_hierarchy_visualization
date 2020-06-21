#!/usr/bin/python3
'#!/usr/bin/python3 -OO'

'''
'''

# @todo update doc string

###########
# Imports #
###########

import re
import os
import asyncio
import pyppeteer
import warnings
import urllib
import time
import psutil
import tqdm
import json
import networkx as nx
from typing import Awaitable, List, Set, Iterable, Dict

from misc_utilities import *

###########
# Globals #
###########

ROOT_NODE_TO_OUTPUT_JSON_FILE_BASE_NAME = {
    'wd:Q11660': 'ai_data.json',
    'wd:Q844935': 'coronary_artery_disease_data.json',
    'wd:Q83267': 'crime_data.json',
    'wd:Q81096': 'engineer_data.json',
    'wd:Q837171': 'financial_services_data.json',
    'wd:Q216916': 'military_aircraft_data.json',
}
OUTPUT_DIR = './json/'

BROWSER_IS_HEADLESS = False
MAX_NUMBER_OF_NEW_PAGE_ATTEMPTS = 50
NUMBER_OF_ATTEMPTS_PER_SLEEP = 3
SLEEPING_RANGE_SLEEP_TIME= 10

##########################
# Web Scraping Utilities #
##########################

def _sleeping_range(upper_bound: int):
    for attempt_index in range(upper_bound):
        if attempt_index and attempt_index % NUMBER_OF_ATTEMPTS_PER_SLEEP == 0:
            time.sleep(SLEEPING_RANGE_SLEEP_TIME*(attempt_index//NUMBER_OF_ATTEMPTS_PER_SLEEP))
        yield attempt_index

EVENT_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(EVENT_LOOP)

async def _launch_browser() -> pyppeteer.browser.Browser:
    browser: pyppeteer.browser.Browser = await pyppeteer.launch({'headless': BROWSER_IS_HEADLESS,})
    return browser

BROWSER = EVENT_LOOP.run_until_complete(_launch_browser())

def scrape_function(func: Awaitable) -> Awaitable:
    async def decorating_function(*args, **kwargs):
        unique_bogus_result_identifier = object()
        result = unique_bogus_result_identifier
        global BROWSER
        for _ in _sleeping_range(MAX_NUMBER_OF_NEW_PAGE_ATTEMPTS):
            try:
                updated_kwargs = kwargs.copy()
                pages = await BROWSER.pages()
                page = pages[-1]
                updated_kwargs['page'] = page
                result = await func(*args, **updated_kwargs)
            except (pyppeteer.errors.BrowserError,
                    pyppeteer.errors.ElementHandleError,
                    pyppeteer.errors.NetworkError,
                    pyppeteer.errors.PageError,
                    pyppeteer.errors.PyppeteerError) as err:
                warnings.warn(f'\n{time.strftime("%m/%d/%Y_%H:%M:%S")} {func.__name__} {err}')
                warnings.warn(f'\n{time.strftime("%m/%d/%Y_%H:%M:%S")} Launching new page.')
                await BROWSER.newPage()
            except pyppeteer.errors.TimeoutError as err:
                warnings.warn(f'\n{time.strftime("%m/%d/%Y_%H:%M:%S")} {func.__name__} {err}')
                warnings.warn(f'\n{time.strftime("%m/%d/%Y_%H:%M:%S")} Launching new browser.')
                browser_process = only_one([process for process in psutil.process_iter() if process.pid==BROWSER.process.pid])
                for child_process in browser_process.children(recursive=True):
                    child_process.kill()
                browser_process.kill() # @hack memory leak ; this doesn't actually kill the process (or maybe it just doesn't free the PID?) until the encompassing python process closes
                BROWSER = await _launch_browser()
            except Exception as err:
                raise
            if result != unique_bogus_result_identifier:
                break
        if result == unique_bogus_result_identifier:
            raise Exception
        return result
    return decorating_function

######################
# Wikidata Utilities #
######################

WIKI_DATA_QUERY_SERVICE_URI = 'https://query.wikidata.org'

@scrape_function
async def _query_wikidata_via_web_scraper(sparql_query:str, *, page: pyppeteer.page.Page) -> List[Dict[str, str]]:
    sparql_query_encoded = urllib.parse.quote(sparql_query)
    uri = WIKI_DATA_QUERY_SERVICE_URI+'/#'+sparql_query_encoded
    await page.goto(uri)
    selector_query_for_arbitrary_text_inside_query_box = 'span.cm-variable-2'
    await page.waitForSelector(selector_query_for_arbitrary_text_inside_query_box)
    button = await page.querySelector('button#execute-button')
    await page.evaluate('(button) => button.click()', button)
    await page.waitForSelector('div.th-inner')
    column_header_divs = await page.querySelectorAll('div.th-inner')
    number_of_variables_queried = len(column_header_divs)
    variable_names = []
    for column_header_div in column_header_divs:
        variable_name = await page.evaluate('(column_header_div) => column_header_div.textContent', column_header_div)
        variable_names.append('?'+variable_name)
    query_result_divs = await page.querySelectorAll('div#query-result')
    query_result_div = only_one(query_result_divs)
    query_result_rows = await query_result_div.querySelectorAll('tr')
    results: List[Dict[str, str]] = []
    result = {}
    for query_result_row in query_result_rows:
        query_result_row_tds = await query_result_row.querySelectorAll('td')
        for result_item_index, query_result_row_td in enumerate(query_result_row_tds):
            result_item_variable_name = variable_names[result_item_index%number_of_variables_queried]
            query_result_row_td_explore_anchors = await query_result_row_td.querySelectorAll('a.explore')
            assert len(query_result_row_td_explore_anchors) in (0,1)
            answer_is_wikidata_entity = len(query_result_row_td_explore_anchors) == 1
            glyphicon_anchors = await query_result_row_td.querySelectorAll('a.gallery.glyphicon.glyphicon-picture')
            assert len(glyphicon_anchors) in (0,1)
            answer_is_image = len(glyphicon_anchors) == 1
            if answer_is_wikidata_entity:
                anchors = await query_result_row_td.querySelectorAll('a.item-link')
                anchor = only_one(anchors)
                result_text = await page.evaluate('(anchor) => anchor.textContent', anchor)
            elif answer_is_image:
                glyphicon_anchor = only_one(glyphicon_anchors)
                result_text = await page.evaluate('(anchor) => anchor.getAttribute("href")', glyphicon_anchor)
            else:
                result_text = await page.evaluate('(query_result_row_td) => query_result_row_td.textContent', query_result_row_td)
            result[result_item_variable_name] = result_text
            if (1+result_item_index)%number_of_variables_queried==0:
                assert len(result) == number_of_variables_queried
                results.append(result)
                result = dict()
    return results

def execute_sparql_query_via_wikidata(sparql_query:str) -> List[Dict[str, str]]:
    return EVENT_LOOP.run_until_complete(_query_wikidata_via_web_scraper(sparql_query))

######################################
# Domain Specific Wikidata Utilities #
######################################

INSTANCE_OF = 'wdt:P31'
SUBCLASS_OF = 'wdt:P279'
IMAGE = 'wdt:P18'

def get_misc_entity_info(class_entities: Iterable[str]) -> Dict[str, int]:
    number_of_instances_query = f'''
SELECT ?ENTITY (count(?INSTANCE) as ?NUM_INSTANCES) WHERE {{
    VALUES ?ENTITY {{ {' '.join(class_entities)} }}.
    ?INSTANCE {INSTANCE_OF} ?ENTITY.
}}
GROUP BY ?ENTITY
HAVING(COUNT(?INSTANCE) > 0)
'''
    number_of_instances_query_results = execute_sparql_query_via_wikidata(number_of_instances_query)
    assert implies(number_of_instances_query_results, set(map(len,number_of_instances_query_results)) == {2})
    number_of_instances_query_results_as_dict = {number_of_instances_query_result['?ENTITY']:number_of_instances_query_result['?NUM_INSTANCES'] for number_of_instances_query_result  in number_of_instances_query_results}
    
    image_query = f'''
SELECT ?ENTITY ?PIC WHERE {{
    VALUES ?ENTITY {{ {' '.join(class_entities)} }}.
    ?ENTITY {IMAGE} ?PIC.
}}
'''
    image_query_results = execute_sparql_query_via_wikidata(image_query)
    assert implies(image_query_results, set(map(len,image_query_results)) == {2})
    image_query_results_as_dict = {image_query_result['?ENTITY']:image_query_result['?PIC'] for image_query_result  in image_query_results}

    entity_to_misc_info = {
        class_entity: {
            'number_of_instances': number_of_instances_query_results_as_dict.get(class_entity, 0),
            'image_url': image_query_results_as_dict.get(class_entity, ''),
        }
        for class_entity in class_entities
    }
    return entity_to_misc_info

def get_subclasses_of_entities(class_entities: Iterable[str]) -> Dict[str, List[Dict[str, str]]]:
    query = f'''
SELECT ?ENTITY ?SUBCLASS ?SUBCLASSLabel ?SUBCLASSDescription WHERE {{
    VALUES ?ENTITY {{ {' '.join(class_entities)} }}.
    ?SUBCLASS {SUBCLASS_OF} ?ENTITY.
    SERVICE wikibase:label {{ bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }}
}}
'''
    query_results = execute_sparql_query_via_wikidata(query)
    assert implies(query_results, set(map(len,query_results)) == {4})
    answer = {class_entity: [] for class_entity in class_entities}
    for query_result in query_results:
        entity = query_result['?ENTITY']
        del query_result['?ENTITY']
        answer[entity].append(query_result)
    return answer

def generate_hierarchy(start_node: str) -> nx.DiGraph:
    hierarchy = nx.DiGraph()
    print(f'Gathering start node ({start_node}) data.')
    start_node_properties = only_one(execute_sparql_query_via_wikidata(f'''
SELECT ?itemLabel ?itemDescription WHERE {{
    VALUES ?item {{ {start_node} }}
    SERVICE wikibase:label {{ bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }}
}}
'''))
    hierarchy.add_node(start_node, label=start_node_properties['?itemLabel'], description=start_node_properties['?itemDescription'], distance_to_root=0)
    print('Initializing BFS.')
    current_entities = {start_node}
    pbar = tqdm.tqdm(unit=' breadths') ; iteration_index = 0 ; update_pbar_description = lambda : pbar.set_description(f'Hierarchy node count {len(hierarchy.nodes)}')
    while current_entities:
        update_pbar_description()
        iteration_index += 1
        subclass_results = get_subclasses_of_entities(current_entities)
        current_entities = set()
        for entity, subclass_dicts in subclass_results.items():
            for subclass_dict in subclass_dicts:
                subclass_is_valid = subclass_dict['?SUBCLASS'][3:] != subclass_dict['?SUBCLASSLabel']
                if subclass_is_valid:
                    hierarchy.add_edge(entity, subclass_dict['?SUBCLASS'])
                    hierarchy.add_node(subclass_dict['?SUBCLASS'], label=subclass_dict['?SUBCLASSLabel'], description=subclass_dict['?SUBCLASSDescription'], distance_to_root=iteration_index)
                    current_entities.add(subclass_dict['?SUBCLASS'])
                    update_pbar_description()
        pbar.update()
    pbar.close()
    print('Gathering instance counts.')
    entity_to_misc_info = get_misc_entity_info(hierarchy.nodes)
    for entity, misc_info in entity_to_misc_info.items():
        number_of_instances = int(misc_info['number_of_instances'])
        hierarchy.nodes[entity]['number_of_instances'] = number_of_instances
        image_url = misc_info['image_url']
        hierarchy.nodes[entity]['image_url'] = image_url
    print('Hierarchy gathering complete.')
    return hierarchy

##########
# Driver #
##########

@debug_on_error
def gather_data() -> None:
    for start_node, output_json_file_base_name in ROOT_NODE_TO_OUTPUT_JSON_FILE_BASE_NAME.items():
        hierarchy = generate_hierarchy(start_node)
        json_data = nx.readwrite.node_link_data(hierarchy, {'source': 'parent', 'target': 'child'})
        output_json_file = os.path.join(OUTPUT_DIR, output_json_file_base_name)
        if not os.path.exists(OUTPUT_DIR):
            os.makedirs(OUTPUT_DIR)
        with open(output_json_file, 'w') as file_handle:
            json.dump(json_data, file_handle, indent=4)
        print(f'Hierarchy data exported to {output_json_file}')
        print()
    return 

if __name__ == '__main__':
    gather_data()
