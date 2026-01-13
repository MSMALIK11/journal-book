

import { signIn,getUser,signUp,signout } from "./user.service";
import {trade} from "./trade.service";
import {stock} from "./stock.service";
import {instrumnts}   from './instruments.service'
import {dashboard}   from './dashboard.service'
import { strategy } from "./strategy.services";
const modules = {signIn,getUser,signUp,signout,trade,stock,instrumnts,dashboard,strategy}

  export default modules