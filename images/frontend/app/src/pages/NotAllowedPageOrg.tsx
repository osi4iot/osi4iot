import  { FC } from 'react'
import ErrorPage from './ErrorPage'


const NotAllowedPageOrg: FC<{}> = () => {
    return <ErrorPage>To access to this page organization admin privileges are needed</ErrorPage>
}

export default NotAllowedPageOrg;