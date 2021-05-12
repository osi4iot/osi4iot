import  { FC } from 'react'
import ErrorPage from './ErrorPage'


const NotAllowedPagePlatform: FC<{}> = () => {
    return <ErrorPage>To access to this page platform admin privileges are needed</ErrorPage>
}

export default NotAllowedPagePlatform;
