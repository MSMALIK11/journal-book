

import { signIn,getUser,signUp,signout } from "./user.service";
import {trade} from "./trade.service";
import {stock} from "./stock.service";
import {instrumnts}   from './instruments.service'
import {dashboard}   from './dashboard.service'
const modules = {signIn,getUser,signUp,signout,trade,stock,instrumnts,dashboard}

  export default modules