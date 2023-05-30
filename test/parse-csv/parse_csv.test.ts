import fs from 'node:fs/promises';

import db from '#db';
import rel from '#rel';

const test = new rel(await db.load(await fs.open('test/parse-csv/test.db'), 'w+'));

for await (const user of test.transaction()
    .select('users'))
    console.log(user);