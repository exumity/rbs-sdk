import {QueryBuilder} from '../../services/ProductService2/src/search/queryBuilder'
import {
    CategoryTree,
    Filter,
    Product,
    SearchResponse,
    ServiceResponse,
    List,
    BulkUpdateItem,
    StockOperationResult,
    SingleMerchantProductStock
} from '../../services/ProductService2/src/search/models'

import axios from 'axios'
import {verify} from "jsonwebtoken";

const SERVICE_URL = process.env.SERVICE_URL || 'https://rbs.rettermobile.com'
const SERVICE_URL_TEST = process.env.SERVICE_URL_TEST || 'https://rbsmaintest.rettermobile.com'
const AGGS_ENDPOINT = '/ProductService2/aggs'
const SEARCH_ENDPOINT = '/ProductService2/search'

interface RBSConfiguration {
    apiKey?: string
    merchantId?: string
    serviceUrl?: string
    enableLogs?: boolean
    testEnv?: boolean
    endpoint: "server" | "client"
}

export enum SortOrder {
    ASC, DESC
}

interface SearchInput {
    userId?: string
    searchTerm?: string
    categoryId?: string
    culture?: string
    filters?: Array<Filter>
    aggs?: boolean,
    from?: number,
    size?: number,
    sortAttribute?: string,
    sortOrder?: SortOrder,
    inStock?: boolean
}

interface StockOperationStockItem {
    variant: string
    qty: number
}

interface StockOperation {
    productId: string
    stocks: Array<StockOperationStockItem>
}

type RbsJwtToken = string

interface CustomToken {
    customToken: RbsJwtToken
}

interface ClientAuthenticateResponse {
    accessToken: RbsJwtToken;
    refreshToken: RbsJwtToken
}

export interface RbsTokenPayload {
    projectId: string;
    userId: string;
    iat: number;
    exp: number;
}


/**
 * RBSClient
 */
export default class RBSClient {

    config: RBSConfiguration

    constructor(config: RBSConfiguration) {
        this.config = config
        if (!this.config.serviceUrl) {
            this.config.serviceUrl = config.testEnv ? SERVICE_URL_TEST + '/' + config.endpoint : SERVICE_URL + '/' + config.endpoint
        }

        if (this.config.enableLogs) {
            axios.interceptors.request.use(request => {
                console.log(JSON.stringify(request, null, 4))
                return request
            })
            axios.interceptors.response.use(response => {
                console.log(response)
                //console.log(JSON.stringify(response, null, 4))
                return response
            })
        }
    }

    getRbsTokenPayload(token: RbsJwtToken): RbsTokenPayload {
        return <RbsTokenPayload>JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'))
    }

    private addApiKey = (url: string): string => {
        if (!this.config.apiKey) return url
        if (!url.includes('?')) url = url + '?'
        return url + '&auth=' + this.config.apiKey
    }

    public executeStockOperation = (operations: Array<StockOperation>, decrease: boolean = false, simulated: boolean = false): Promise<ServiceResponse<StockOperationResult>> => {

        if (!this.config.merchantId) throw new Error('MerchantId should be set in constructor.')

        return new Promise<ServiceResponse<StockOperationResult>>((resolve, reject) => {

            const body = {
                decrease,
                data: operations.map((o) => ({
                    merchant: {
                        id: this.config.merchantId!
                    },
                    productId: o.productId,
                    stocks: o.stocks.map(s => ({variantName: s.variant, stockQty: s.qty}))
                }))
            }

            let url = `${this.config.serviceUrl!}/ProductService2/${simulated ? 'simulatedStockOperation' : 'insertStockOperation'}`
            axios.post(this.addApiKey(url), body).then(response => {
                if (response.data.success) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }
            }).catch(error => {
                if (error.response.data && error.response.data.message) {
                    reject(new Error(error.response.data.message))
                } else {

                    reject(error)
                }
            })
        })
    }

    public search = (input: SearchInput = {
        filters: [],
        aggs: false,
        categoryId: '',
        culture: 'en_US',
        from: 0,
        size: 20,
        inStock: false,
        sortAttribute: 'price',
        sortOrder: SortOrder.DESC
    }): Promise<SearchResponse> => {
        if (!input.userId) throw new Error('UserId is missing')

        return new Promise<SearchResponse>((resolve, reject) => {
            const filtersVal = QueryBuilder.filtersToQueryString(input.filters!)
            const endpoint = input.aggs ? AGGS_ENDPOINT : SEARCH_ENDPOINT

            let url = this.config.serviceUrl! + endpoint + '?filters=' + filtersVal
                + '&categoryId=' + input.categoryId
                + '&culture=' + input.culture
                + '&from=' + input.from
                + '&size=' + input.size
                + '&userId=' + input.userId
                + '&sortBy=' + input.sortAttribute
                + '&sortOrder=' + input.sortOrder

            if (input.inStock) {
                url += '&inStock=' + input.inStock
            }
            if (input.searchTerm) {
                url += '&searchTerm=' + input.searchTerm
            }
            axios.get(this.addApiKey(url), {
                headers: {},
            }).then(response => {
                resolve(response.data)
            }).catch(error => {
                reject(error)
            })
        })
    }

    public updateMerchantData = (items: Array<BulkUpdateItem>): Promise<ServiceResponse<Boolean>> => {
        return new Promise<ServiceResponse<Boolean>>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/ProductService2/updateMerchantData`
            axios.post(this.addApiKey(url), items).then(response => {
                if (response.data.success) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }
            }).catch(error => {
                reject(error)
            })
        })
    }


    public getProduct = (productId: string, culture: string = 'en_US', merchantId?: string): Promise<ServiceResponse<Product>> => {
        return new Promise<ServiceResponse<Product>>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/ProductService2/getProduct?productId=${productId}&culture=${culture}`
            if (merchantId) url += `&merchantId=${merchantId}`
            axios.get(this.addApiKey(url), {
                headers: {}
            }).then(response => {

                if (response.data.success) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }

            }).catch(error => {
                reject(error)
            })
        })
    }

    public getProductStock = (productId: string, merchantId: string, variant: string): Promise<ServiceResponse<SingleMerchantProductStock>> => {
        return new Promise<ServiceResponse<SingleMerchantProductStock>>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/ProductService2/getProductStock?productId=${productId}&merchantId=${merchantId}&variant=${variant}`
            axios.get(this.addApiKey(url), {
                headers: {}
            }).then(response => {

                if (response.data.success) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }
            }).catch(error => {
                reject(error)
            })
        })
    }

    public getProductStockByMerchant = (merchantId: string, variant: string): Promise<ServiceResponse<SingleMerchantProductStock[]>> => {
        return new Promise<ServiceResponse<SingleMerchantProductStock[]>>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/ProductService2/getProductStockByMerchant?merchantId=${merchantId}&variant=${variant}`
            axios.get(this.addApiKey(url), {
                headers: {}
            }).then(response => {

                if (response.data.success) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }
            }).catch(error => {
                reject(error)
            })
        })
    }

    public getMultipleProducts = (productIds: Array<string>, culture: string = 'en_US'): Promise<ServiceResponse<Product>> => {
        return new Promise<ServiceResponse<Product>>((resolve, reject) => {
            let productIdListStr = productIds.join('|')
            let url = `${this.config.serviceUrl!}/ProductService2/getMultipleProducts?productIds=${productIdListStr}&culture=${culture}`
            axios.get(this.addApiKey(url), {
                headers: {}
            }).then(response => {

                if (response.data.success) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }

            }).catch(error => {
                reject(error)
            })
        })
    }

    public getCategories = (culture: string = 'en_US'): Promise<ServiceResponse<CategoryTree>> => {
        return new Promise<ServiceResponse<CategoryTree>>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/ProductService2/getCategories?culture=${culture}`
            axios.get(this.addApiKey(url), {
                headers: {}
            }).then(response => {

                if (response.data.success) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }

            }).catch(error => {
                reject(error)
            })
        })
    }

    public getListProducts = (listId: string, culture: string = 'en_US', inStock: boolean = false): Promise<ServiceResponse<List>> => {
        return new Promise<ServiceResponse<List>>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/ProductService2/getList?culture=${culture}&listId=${listId}`
            if (inStock) {
                url += '&inStock=' + inStock
            }
            axios.get(this.addApiKey(url), {
                headers: {}
            }).then(response => {

                if (response.data.success) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }

            }).catch(error => {
                reject(error)
            })
        })
    }

    public generateCustomToken = (userId: string): Promise<CustomToken> => {
        return new Promise<CustomToken>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/MainService/token?userId=${userId}`
            axios.get(this.addApiKey(url), {
                headers: {}
            }).then(response => {

                if (response.status >= 200 && response.status < 400) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }

            }).catch(error => {
                reject(error)
            })
        })
    }

    public clientAuthenticate = (props: CustomToken): Promise<ClientAuthenticateResponse> => {
        return new Promise<ClientAuthenticateResponse>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/MainService/public/authenticate`
            axios.post(url, props).then(response => {

                if (response.status >= 200 && response.status < 400) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }

            }).catch(error => {
                reject(error)
            })
        })
    }

    public clientRefreshToken = (refreshToken: RbsJwtToken): Promise<ClientAuthenticateResponse> => {
        return new Promise<ClientAuthenticateResponse>((resolve, reject) => {
            let url = `${this.config.serviceUrl!}/MainService/public/refresh-token`
            axios.post(url, {
                refreshToken
            }).then(response => {

                if (response.status >= 200 && response.status < 400) {
                    resolve(response.data)
                } else {
                    reject(new Error(response.data.message))
                }

            }).catch(error => {
                reject(error)
            })
        })
    }


}